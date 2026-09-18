// pull 合并共享助手（TASK-DEV-07）：
//   - 核心实体表 ↔ 冲突实体类型绑定；
//   - dirty guard 判定（口径对齐 `db/repository.ts`，未确认写入保护）；
//   - 远端行（snake_case 线合同）→ 本地行转换（只保留本地白名单列）；
//   - 本地 upsert（直接 SQL，供 pull 在单事务内调用，不复用会自开事务的 repository）。

import type { SqlDatabase, SqlValue } from '../db/database'
import { TABLE_COLUMNS, assertKnownColumns, type CoreEntityTable } from '../db/schema'

/** 冲突实体类型（与 `conflicts.entity_kind` / `CONFLICT_STATUS_VALUES` 同源）。 */
export type ConflictEntityKind = 'place' | 'entry' | 'tag' | 'dimension' | 'media' | 'share'

export interface CoreEntityBinding {
  table: CoreEntityTable
  kind: ConflictEntityKind
}

/** pull 覆盖的带 revision 核心实体（media/share 无 revision，不在此列）。 */
export const CORE_ENTITY_BINDINGS: readonly CoreEntityBinding[] = [
  { table: 'places', kind: 'place' },
  { table: 'entries', kind: 'entry' },
  { table: 'tag_dimensions', kind: 'dimension' },
  { table: 'tags', kind: 'tag' },
]

/** 可本地 upsert 的核心实体表（冲突裁决用）。 */
export function tableForConflictKind(kind: ConflictEntityKind): CoreEntityTable | null {
  const found = CORE_ENTITY_BINDINGS.find((b) => b.kind === kind)
  return found ? found.table : null
}

export type LocalRow = Record<string, SqlValue>

/**
 * dirty 判定（与 `Repository.isDirty` 同口径）：
 *   1. `sync_status` 非 `synced`（local/syncing/failed/conflict）即未确认；
 *   2. 或 `revision !== (base_revision ?? revision)`。
 * 未确认本机写入在 pull 落盘前受保护，不被远端静默覆盖。
 */
export function isDirtyRow(row: LocalRow): boolean {
  const status = row.sync_status
  if (typeof status === 'string' && status !== 'synced') return true
  const revision = typeof row.revision === 'number' ? row.revision : 0
  const base = typeof row.base_revision === 'number' ? row.base_revision : revision
  return revision !== base
}

/** 本地已确认的基线 revision（无则退化为本地 revision，再退化为 0）。 */
export function baseRevisionOf(row: LocalRow): number {
  if (typeof row.base_revision === 'number') return row.base_revision
  return typeof row.revision === 'number' ? row.revision : 0
}

/**
 * 远端线合同行 → 本地行：只取本地白名单列，并补齐本地同步字段。
 * `revision` 同时写入 `base_revision`（远端即已确认基线），`sync_status = 'synced'`。
 */
export function remoteRowToLocalRow(table: CoreEntityTable, remote: Record<string, unknown>): LocalRow {
  const allowed = new Set<string>(TABLE_COLUMNS[table])
  const row: LocalRow = {}
  for (const [key, value] of Object.entries(remote)) {
    if (!allowed.has(key) || value === undefined) continue
    row[key] = value as SqlValue
  }
  const revision = typeof remote.revision === 'number' ? remote.revision : 0
  row.revision = revision
  row.base_revision = revision
  row.sync_status = 'synced'
  // 仅部分核心实体带 sync_error（tags/tag_dimensions 无此列）。
  if (allowed.has('sync_error')) row.sync_error = null
  if (!('demo' in row)) row.demo = 0
  return row
}

/** 按主键 id upsert（列名经白名单校验，防列名注入/拼写漂移）。 */
export function upsertLocalRow(db: SqlDatabase, table: CoreEntityTable, row: LocalRow): void {
  const cols = Object.keys(row)
  if (cols.length === 0) throw new Error(`upsert ${table}: 空行`)
  if (!cols.includes('id')) throw new Error(`upsert ${table}: 缺少主键 id`)
  assertKnownColumns(table, cols)
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`)
  const sql =
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})` +
    (updates.length ? ` ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}` : '')
  db.runSync(sql, ...cols.map((c) => row[c]))
}

/** 把本地行标为 conflict（内容原样保留，等人工裁决）。 */
export function markLocalConflict(db: SqlDatabase, table: CoreEntityTable, id: string): void {
  db.runSync(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?`, id)
}
