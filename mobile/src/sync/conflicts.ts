// 冲突落库与裁决（TASK-DEV-07；SDD T073 本地段，UI 只消费本接口）。
//
// 语义对齐 Web `src/lib/sync.ts` 的 `registerConflict` / `resolveConflict`：
//   - pull 检测到「本地未确认写入」与「远端同一 base 之后又前进」分叉时，
//     把本地内容原样保留，登记一条 `open` 冲突（local/remote 快照），绝不静默覆盖；
//   - `take_remote`：用远端快照覆盖本地（base 对齐远端 revision，置 synced）；
//   - `keep_local`：保留本地内容，把 base 对齐远端 revision 并标 local dirty，
//     交由 push 以远端 revision 为 expected 条件更新（0 行再冲突）；
//   - 裁决只改本地结构与冲突状态，不触网、不推送（push 接线属后续 Task）。

import type { SqlDatabase } from '../db/database'
import { TABLE_COLUMNS } from '../db/schema'
import {
  baseRevisionOf,
  remoteRowToLocalRow,
  tableForConflictKind,
  upsertLocalRow,
  type ConflictEntityKind,
  type LocalRow,
} from './merge'

export type { ConflictEntityKind } from './merge'

export type ConflictStatus = 'open' | 'keep_local' | 'take_remote'
/** 裁决选择（与 conflicts.status 枚举同名）。 */
export type ConflictChoice = 'take_remote' | 'keep_local'

export interface ConflictRow {
  id: number
  entity_id: string
  entity_kind: ConflictEntityKind
  expected_revision: number | null
  local_snapshot: string | null
  remote_snapshot: string | null
  status: ConflictStatus
  created_at: string
  resolved_at: string | null
  resolution: string | null
}

export interface ConflictInput {
  entityId: string
  entityKind: ConflictEntityKind
  expectedRevision?: number | null
  localSnapshot?: unknown
  remoteSnapshot?: unknown
  now?: string
}

export interface ResolveConflictResult {
  ok: boolean
  conflict?: ConflictRow
  error?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseSnapshot(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 登记冲突（保留本地/远端快照，不覆盖本地内容）。 */
export function addConflictRecord(db: SqlDatabase, input: ConflictInput): number {
  const res = db.runSync(
    `INSERT INTO conflicts (entity_id, entity_kind, expected_revision, local_snapshot, remote_snapshot, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    input.entityId,
    input.entityKind,
    input.expectedRevision ?? null,
    input.localSnapshot === undefined ? null : JSON.stringify(input.localSnapshot),
    input.remoteSnapshot === undefined ? null : JSON.stringify(input.remoteSnapshot),
    input.now ?? nowIso(),
  )
  return res.lastInsertRowId
}

/** 是否已有同实体未裁决冲突（避免 pull 每轮重复登记）。 */
export function findOpenConflict(db: SqlDatabase, kind: ConflictEntityKind, entityId: string): ConflictRow | null {
  return db.getFirstSync<ConflictRow>(
    "SELECT * FROM conflicts WHERE entity_kind = ? AND entity_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
    kind,
    entityId,
  )
}

/** 列出冲突；不给 status 时返回全部（按 id 升序）。 */
export function listConflicts(db: SqlDatabase, status?: ConflictStatus): ConflictRow[] {
  if (status) {
    return db.getAllSync<ConflictRow>('SELECT * FROM conflicts WHERE status = ? ORDER BY id ASC', status)
  }
  return db.getAllSync<ConflictRow>('SELECT * FROM conflicts ORDER BY id ASC')
}

/** 待裁决（open）冲突，UI 列表用。 */
export function listOpenConflicts(db: SqlDatabase): ConflictRow[] {
  return listConflicts(db, 'open')
}

export function getConflict(db: SqlDatabase, id: number): ConflictRow | null {
  return db.getFirstSync<ConflictRow>('SELECT * FROM conflicts WHERE id = ?', id)
}

/**
 * 用户裁决冲突。
 * @param choice `take_remote`（采用云端）| `keep_local`（保留本地）
 */
export function resolveConflict(
  db: SqlDatabase,
  id: number,
  choice: ConflictChoice,
  now: string = nowIso(),
): ResolveConflictResult {
  const conflict = getConflict(db, id)
  if (!conflict) return { ok: false, error: '冲突记录不存在' }
  if (conflict.status !== 'open') return { ok: false, error: `冲突已裁决：${conflict.status}` }

  const table = tableForConflictKind(conflict.entity_kind)
  if (!table) return { ok: false, error: `不支持的实体类型：${conflict.entity_kind}` }

  const remote = parseSnapshot(conflict.remote_snapshot)
  const local = db.getFirstSync<LocalRow>(`SELECT * FROM ${table} WHERE id = ?`, conflict.entity_id)

  try {
    db.withTransactionSync(() => {
      if (choice === 'take_remote') {
        if (!remote) {
          throw new Error('云端行已不存在，无法采用云端版本；请选择「保留本地」')
        }
        upsertLocalRow(db, table, remoteRowToLocalRow(table, remote))
      } else {
        if (!local) {
          throw new Error('本地行已不存在，无法保留本地版本')
        }
        const remoteRevision = typeof remote?.revision === 'number' ? remote.revision : null
        // 保留本地：base 对齐远端 revision，revision 继续前进，标 local 待 push（expected=远端 revision）。
        const nextRevision = Math.max(typeof local.revision === 'number' ? local.revision : 0, remoteRevision ?? 0) + 1
        const clearError = TABLE_COLUMNS[table].includes('sync_error') ? ', sync_error = NULL' : ''
        db.runSync(
          `UPDATE ${table} SET revision = ?, base_revision = ?, sync_status = 'local'${clearError} WHERE id = ?`,
          nextRevision,
          remoteRevision ?? baseRevisionOf(local),
          conflict.entity_id,
        )
      }
      db.runSync(
        'UPDATE conflicts SET status = ?, resolved_at = ?, resolution = ? WHERE id = ?',
        choice,
        now,
        choice,
        id,
      )
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  return { ok: true, conflict: getConflict(db, id) ?? undefined }
}
