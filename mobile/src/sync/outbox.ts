// 持久 outbox（T019）：入队 / 认领 / 重试计数 / 停放。
//
// 仅本地结构与单元，不接网络（push/pull 属 T063+）。语义对齐 Web `src/lib/idb.ts`
// + `src/lib/sync.ts`：同一 op 反复失败达到 `MAX_ATTEMPTS` 后移出待办、置 `parked`
// 并停放 `PARK_MS`，期间不再被认领；手动编辑会产生新 op 正常重试（FR-013/014/016）。
//
// 事务约定：`insertOutboxOp` 不自己开事务，供 repository 在「写实体 + 入队」的同一
// 事务里调用（T040 原子边界）；`createOutbox` 暴露的 enqueue/fail 等自开事务，供独立调用。

import type { SqlDatabase } from '../db/database'
import { assertKnownColumns, OUTBOX_KINDS, type TableName } from '../db/schema'

export type OutboxOpKind = (typeof OUTBOX_KINDS)[number]

/** 逻辑操作描述（入队输入）。 */
export interface OutboxOp {
  kind: OutboxOpKind
  /** 单实体操作的目标 id。 */
  entityId?: string
  /** 批量操作的目标 id 集合（如 delete_tags）。 */
  entityIds?: string[]
  /** 依赖的 op_id 列表（媒体 DAG，T040/T050 使用；V1 骨架只存不管）。 */
  dependsOn?: string[]
}

/** outbox 表行（snake_case，直读 DB）。 */
export interface OutboxRow {
  seq: number
  op_id: string
  kind: OutboxOpKind
  entity_id: string | null
  entity_ids: string | null
  depends_on: string
  status: 'pending' | 'claimed' | 'parked'
  attempts: number
  last_error: string | null
  created_at: string
  claimed_at: string | null
  parked_at: string | null
}

/** 毒丸 op 停放阈值与停放时长（对齐 Web sync.ts）。 */
export const MAX_ATTEMPTS = 5
export const PARK_MS = 24 * 60 * 60 * 1000
/** 认领租约：超时未完成视为进程中断，可被重新认领。 */
export const CLAIM_TTL_MS = 2 * 60 * 1000

const OUTBOX_INSERT_COLUMNS = [
  'op_id', 'kind', 'entity_id', 'entity_ids', 'depends_on', 'status', 'attempts',
  'last_error', 'created_at', 'claimed_at', 'parked_at',
] as const

let opCounter = 0

/** 生成本地唯一 op_id（无需全局加密强度；时间戳+自增+随机避免同毫秒碰撞）。 */
export function newOpId(): string {
  opCounter = (opCounter + 1) % 100000
  return `op-${Date.now().toString(36)}-${opCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 低层入队：只 INSERT，不管理事务。必须在调用方事务内使用，才能与实体写入原子。
 * @returns 新插入行的 op_id
 */
export function insertOutboxOp(db: SqlDatabase, op: OutboxOp, opts?: { opId?: string; now?: string }): string {
  const opId = opts?.opId ?? newOpId()
  assertKnownColumns('outbox' as TableName, [...OUTBOX_INSERT_COLUMNS])
  db.runSync(
    `INSERT INTO outbox (${OUTBOX_INSERT_COLUMNS.join(', ')})
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?, NULL, NULL)`,
    opId,
    op.kind,
    op.entityId ?? null,
    op.entityIds ? JSON.stringify(op.entityIds) : null,
    op.dependsOn ? JSON.stringify(op.dependsOn) : '[]',
    opts?.now ?? nowIso(),
  )
  return opId
}

function rowFromOpId(db: SqlDatabase, opId: string): OutboxRow | null {
  return db.getFirstSync<OutboxRow>('SELECT * FROM outbox WHERE op_id = ?', opId)
}

/** 把 outbox 行还原为逻辑 op（供 dispatcher 使用）。 */
export function rowToOp(row: OutboxRow): OutboxOp {
  return {
    kind: row.kind,
    entityId: row.entity_id ?? undefined,
    entityIds: row.entity_ids ? (JSON.parse(row.entity_ids) as string[]) : undefined,
    dependsOn: row.depends_on ? (JSON.parse(row.depends_on) as string[]) : undefined,
  }
}

export interface Outbox {
  /** 入队（自开事务）。重复 op_id 触发唯一约束错误。 */
  enqueue(op: OutboxOp, opts?: { opId?: string; now?: string }): string
  /** 按 seq 升序认领至多 limit 条 pending，标记 claimed 并返回。 */
  claim(limit?: number, now?: string): OutboxRow[]
  /** 认领成功：删除该 op。 */
  complete(opId: string): void
  /** 认领失败：attempts+1；达阈值转 parked（带 parked_at），否则回 pending 留 last_error。 */
  fail(opId: string, error: string, now?: string): OutboxRow | null
  /** 释放超时认领（进程被杀遗留），回 pending；返回释放条数。 */
  releaseStaleClaims(now?: string, ttlMs?: number): number
  /** 释放单条 claimed 回 pending（DAG 阻塞/整轮超时时归还队列）；非 claimed 不动。 */
  release(opId: string): number
  /** 强制停放（调试/毒丸处理）。 */
  park(opId: string, now?: string): void
  /** 取消停放，回 pending。 */
  unpark(opId: string): void
  /** 待处理（pending/claimed，不含 parked）条数。 */
  pendingCount(): number
  /** 全量按 seq 升序。 */
  list(): OutboxRow[]
  get(opId: string): OutboxRow | null
}

export function createOutbox(db: SqlDatabase): Outbox {
  return {
    enqueue(op, opts) {
      let opId = ''
      db.withTransactionSync(() => {
        opId = insertOutboxOp(db, op, opts)
      })
      return opId
    },

    claim(limit = 1, now = nowIso()) {
      let result: OutboxRow[] = []
      db.withTransactionSync(() => {
        const rows = db.getAllSync<OutboxRow>(
          "SELECT * FROM outbox WHERE status = 'pending' ORDER BY seq ASC LIMIT ?",
          limit,
        )
        for (const row of rows) {
          db.runSync("UPDATE outbox SET status = 'claimed', claimed_at = ? WHERE seq = ?", now, row.seq)
        }
        result = rows.map((r) => ({ ...r, status: 'claimed' as const, claimed_at: now }))
      })
      return result
    },

    complete(opId) {
      db.runSync('DELETE FROM outbox WHERE op_id = ?', opId)
    },

    fail(opId, error, now = nowIso()) {
      let result: OutboxRow | null = null
      db.withTransactionSync(() => {
        const row = rowFromOpId(db, opId)
        if (!row) {
          result = null
          return
        }
        if (row.status === 'parked') {
          result = row
          return
        }
        const attempts = row.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          db.runSync(
            "UPDATE outbox SET attempts = ?, last_error = ?, status = 'parked', parked_at = ? WHERE op_id = ?",
            attempts,
            error,
            now,
            opId,
          )
        } else {
          db.runSync(
            "UPDATE outbox SET attempts = ?, last_error = ?, status = 'pending', claimed_at = NULL WHERE op_id = ?",
            attempts,
            error,
            opId,
          )
        }
        result = rowFromOpId(db, opId)
      })
      return result
    },

    releaseStaleClaims(now = nowIso(), ttlMs = CLAIM_TTL_MS) {
      const cutoff = new Date(new Date(now).getTime() - ttlMs).toISOString()
      const res = db.runSync(
        "UPDATE outbox SET status = 'pending', claimed_at = NULL WHERE status = 'claimed' AND claimed_at IS NOT NULL AND claimed_at < ?",
        cutoff,
      )
      return res.changes
    },

    release(opId) {
      const res = db.runSync(
        "UPDATE outbox SET status = 'pending', claimed_at = NULL WHERE op_id = ? AND status = 'claimed'",
        opId,
      )
      return res.changes
    },

    park(opId, now = nowIso()) {
      db.runSync("UPDATE outbox SET status = 'parked', parked_at = ? WHERE op_id = ?", now, opId)
    },

    unpark(opId) {
      db.runSync("UPDATE outbox SET status = 'pending', parked_at = NULL, claimed_at = NULL WHERE op_id = ?", opId)
    },

    pendingCount() {
      const row = db.getFirstSync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'claimed')",
      )
      return row?.n ?? 0
    },

    list() {
      return db.getAllSync<OutboxRow>('SELECT * FROM outbox ORDER BY seq ASC')
    },

    get(opId) {
      return rowFromOpId(db, opId)
    },
  }
}
