// 事务仓库基座（T017/T018）：参数化读写 + 事务 + 原子入队 + revision/dirty guard。
//
// 关键语义（对齐 Web `src/lib/idb.ts` + `src/lib/sync.ts`，R-01 D4）：
//   - 核心实体每次本地保存 `revision + 1`、`sync_status = 'local'`；
//   - `base_revision` 只在云端确认后更新；dirty = `revision !== (base_revision ?? revision)`
//     或 `sync_status ∈ {local, syncing, failed, conflict}`；
//   - dirty 行在 pull 落盘前受保护，不被远端静默覆盖（未确认写入保护）；
//   - 实体写入与 outbox 入队在同一事务，全成或全败（T040 原子边界）。
//
// 本文件不接网络：只落本地结构与单元。

import type { SqlDatabase, SqlValue, SqlRunResult } from './database'
import {
  CORE_ENTITY_TABLES,
  TABLE_COLUMNS,
  assertKnownColumns,
  type CoreEntityTable,
  type TableName,
} from './schema'
import { insertOutboxOp, type OutboxOp } from '../sync/outbox'

/** 单主键 `id` 的表（通用 CRUD 适用）。 */
const SINGLE_ID_TABLES = [
  'places', 'entries', 'media', 'tag_dimensions', 'tags', 'share_snapshots',
] as const
type SingleIdTable = (typeof SINGLE_ID_TABLES)[number]

export type EntityRow = Record<string, SqlValue>

export interface ConflictRecordInput {
  entityId: string
  entityKind: 'place' | 'entry' | 'tag' | 'dimension' | 'media' | 'share'
  expectedRevision?: number | null
  localSnapshot?: unknown
  remoteSnapshot?: unknown
  now?: string
}

export interface Repository {
  /** 只读包裹（不开启写事务）。 */
  read<T>(fn: (db: SqlDatabase) => T): T
  /** 读写事务：fn 抛错则整体回滚，返回值透传。 */
  transaction<T>(fn: (db: SqlDatabase) => T): T

  /** 按单主键 id 取一行。 */
  get<T>(table: SingleIdTable, id: string): T | null
  /** 取全表（按插入顺序无保证）。 */
  all<T>(table: SingleIdTable): T[]
  /** 参数化 upsert（按主键 id 冲突更新）。 */
  upsert(table: SingleIdTable, row: EntityRow): void
  /** 按 id 删除，返回受影响行数。仅测试/种子用：不入队，业务删除走 `removeWithOutbox`。 */
  remove(table: SingleIdTable, id: string): number
  count(table: TableName): number

  /** 核心实体保存（revision+1、标 dirty、sync_error 清空），自开事务。 */
  saveCoreEntity(table: CoreEntityTable, row: EntityRow, now?: string): void
  /** 实体写入 + outbox 入队，同一事务；返回 op_id。 */
  saveEntityWithOutbox(table: CoreEntityTable, row: EntityRow, op: OutboxOp, opts?: { now?: string; opId?: string }): string
  /** 实体删除 + outbox 入队，同一事务（T040 原子边界）；返回 op_id。 */
  removeWithOutbox(table: SingleIdTable, id: string, op: OutboxOp): string

  /**
   * media 行批量入库 + 每条 `upload_media` op 入队，同一事务（T050 原子边界）；
   * 可选把指定 media 作为 entry 封面回填（本地 dirty，revision+1）。
   * `remote_path`/`remote_thumb_path` 由调用方置空，待上传后再回填。
   * @returns 与 rows 等长的 upload_media op_id 数组
   */
  saveMediaBatch(
    rows: EntityRow[],
    opts?: { entryId?: string; coverMediaId?: string | null; dependsOn?: string[]; now?: string },
  ): string[]

  /** 云端确认：revision = base_revision = 服务端 revision，置 synced。 */
  markSynced(table: CoreEntityTable, id: string, revision: number): void
  /** 同步失败：置 failed 并记录错误（保留 dirty guard）。 */
  markFailed(table: CoreEntityTable, id: string, error?: string): void
  /** 乐观锁冲突：置 conflict 等待人工裁决。 */
  markConflict(table: CoreEntityTable, id: string, error?: string): void
  /** dirty 判定（pull 落盘保护口径）。 */
  isDirty(row: { revision?: number | null; base_revision?: number | null; sync_status?: string | null }): boolean
  /** 列出 dirty 核心实体（自愈清扫/重推用）。 */
  listDirty(table: CoreEntityTable): EntityRow[]

  /** 记录冲突（保留本地快照，不覆盖本地内容）。 */
  addConflict(record: ConflictRecordInput): void
}

function pkOf(table: TableName): string {
  if ((SINGLE_ID_TABLES as readonly string[]).includes(table)) return 'id'
  throw new Error(`表 ${table} 不支持单主键 CRUD`)
}

function nowIso(): string {
  return new Date().toISOString()
}

function runInTransaction<T>(db: SqlDatabase, fn: (db: SqlDatabase) => T): T {
  let result!: T
  db.withTransactionSync(() => {
    result = fn(db)
  })
  return result
}

export function createRepository(db: SqlDatabase): Repository {
  function upsertRow(table: TableName, row: EntityRow): void {
    const cols = Object.keys(row)
    if (cols.length === 0) throw new Error(`upsert ${table}: 空行`)
    assertKnownColumns(table, cols)
    const pk = pkOf(table)
    if (!cols.includes(pk)) throw new Error(`upsert ${table}: 缺少主键 ${pk}`)
    const updates = cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`)
    const sql =
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})` +
      (updates.length ? ` ON CONFLICT(${pk}) DO UPDATE SET ${updates.join(', ')}` : ` ON CONFLICT(${pk}) DO NOTHING`)
    db.runSync(sql, ...cols.map((c) => row[c]))
  }

  function writeCoreEntity(table: CoreEntityTable, row: EntityRow, now: string): void {
    if (typeof row.id !== 'string' || row.id.length === 0) throw new Error(`saveCoreEntity ${table}: id 必填`)
    assertKnownColumns(table, Object.keys(row))
    const existing = db.getFirstSync<{ revision: number; base_revision: number | null }>(
      `SELECT revision, base_revision FROM ${table} WHERE id = ?`,
      row.id,
    )
    // revision 单调不回退：调用方可能传入过期快照，取 DB 现值与入参的较大者（P1-1）。
    const revision = Math.max((row.revision as number | undefined) ?? 0, existing?.revision ?? 0) + 1
    const next: EntityRow = {
      ...row,
      revision,
      sync_status: 'local',
      created_at: row.created_at ?? now,
      updated_at: now,
    }
    // 仅带 sync_error 列的核心实体（places/entries）清空错误；tags/tag_dimensions 无此列。
    if (TABLE_COLUMNS[table].includes('sync_error')) next.sync_error = null
    // base_revision 不得被静默清空：未显式传入时沿用 DB 现有值，新行才为 null（P1-2）。
    if (!('base_revision' in next)) next.base_revision = existing?.base_revision ?? null
    upsertRow(table, next)
  }

  return {
    read(fn) {
      return fn(db)
    },

    transaction(fn) {
      return runInTransaction(db, fn)
    },

    get<T>(table: SingleIdTable, id: string) {
      return db.getFirstSync<T>(`SELECT * FROM ${table} WHERE id = ?`, id)
    },

    all<T>(table: SingleIdTable) {
      return db.getAllSync<T>(`SELECT * FROM ${table}`)
    },

    upsert(table, row) {
      db.withTransactionSync(() => upsertRow(table, row))
    },

    // 仅测试/种子用：单语句删除且不入队；业务删除必须走 removeWithOutbox 保证原子。
    remove(table, id) {
      const res: SqlRunResult = db.runSync(`DELETE FROM ${table} WHERE id = ?`, id)
      return res.changes
    },

    count(table) {
      return db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0
    },

    saveCoreEntity(table, row, now = nowIso()) {
      db.withTransactionSync(() => writeCoreEntity(table, row, now))
    },

    saveEntityWithOutbox(table, row, op, opts) {
      const now = opts?.now ?? nowIso()
      let opId = ''
      db.withTransactionSync(() => {
        writeCoreEntity(table, row, now)
        opId = insertOutboxOp(db, op, { opId: opts?.opId, now })
      })
      return opId
    },

    removeWithOutbox(table, id, op) {
      let opId = ''
      db.withTransactionSync(() => {
        db.runSync(`DELETE FROM ${table} WHERE id = ?`, id)
        opId = insertOutboxOp(db, op)
      })
      return opId
    },

    saveMediaBatch(rows, opts) {
      const now = opts?.now ?? nowIso()
      const dependsOn = opts?.dependsOn ?? []
      const opIds: string[] = []
      db.withTransactionSync(() => {
        for (const row of rows) {
          if (typeof row.id !== 'string' || row.id.length === 0) {
            throw new Error('saveMediaBatch: media.id 必填')
          }
          upsertRow('media', {
            sync_status: 'local',
            created_at: row.created_at ?? now,
            updated_at: now,
            ...row,
          })
          opIds.push(insertOutboxOp(db, { kind: 'upload_media', entityId: row.id, dependsOn }, { now }))
        }
        const firstEntryId = rows[0]?.entry_id
        const entryId = opts?.entryId ?? (typeof firstEntryId === 'string' ? firstEntryId : '')
        if (opts?.coverMediaId && entryId) {
          // 封面=首图：本地回填并标 dirty（revision+1）；远端封面由 upload 后 patch 收口（T067）。
          db.runSync(
            `UPDATE entries SET cover_media_id = ?, revision = revision + 1, sync_status = 'local', sync_error = NULL, updated_at = ? WHERE id = ?`,
            opts.coverMediaId,
            now,
            entryId,
          )
        }
      })
      return opIds
    },

    markSynced(table, id, revision) {
      // 只有 places/entries 带 sync_error 列；tags/tag_dimensions 无，条件化清错误列（防 no such column）。
      const clearError = TABLE_COLUMNS[table].includes('sync_error') ? ', sync_error = NULL' : ''
      db.runSync(
        `UPDATE ${table} SET revision = ?, base_revision = ?, sync_status = 'synced'${clearError}, updated_at = ? WHERE id = ?`,
        revision,
        revision,
        nowIso(),
        id,
      )
    },

    markFailed(table, id, error) {
      if (TABLE_COLUMNS[table].includes('sync_error')) {
        db.runSync(`UPDATE ${table} SET sync_status = 'failed', sync_error = ? WHERE id = ?`, error ?? null, id)
        return
      }
      db.runSync(`UPDATE ${table} SET sync_status = 'failed' WHERE id = ?`, id)
    },

    markConflict(table, id, error) {
      if (TABLE_COLUMNS[table].includes('sync_error')) {
        db.runSync(`UPDATE ${table} SET sync_status = 'conflict', sync_error = ? WHERE id = ?`, error ?? null, id)
        return
      }
      db.runSync(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?`, id)
    },

    isDirty(row) {
      const status = row.sync_status ?? null
      if (status !== null && status !== 'synced') return true
      const revision = row.revision ?? 0
      const base = row.base_revision ?? row.revision ?? 0
      return revision !== base
    },

    listDirty(table) {
      return db.getAllSync<EntityRow>(
        `SELECT * FROM ${table} WHERE sync_status IN ('local', 'syncing', 'failed', 'conflict') OR revision <> COALESCE(base_revision, revision)`,
      )
    },

    addConflict(record) {
      const now = record.now ?? nowIso()
      db.runSync(
        `INSERT INTO conflicts (entity_id, entity_kind, expected_revision, local_snapshot, remote_snapshot, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
        record.entityId,
        record.entityKind,
        record.expectedRevision ?? null,
        record.localSnapshot === undefined ? null : JSON.stringify(record.localSnapshot),
        record.remoteSnapshot === undefined ? null : JSON.stringify(record.remoteSnapshot),
        now,
      )
    },
  }
}

export { CORE_ENTITY_TABLES, TABLE_COLUMNS }
