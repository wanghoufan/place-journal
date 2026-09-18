// 同步状态只读汇总（TASK-DEV-09，Mine / Conflicts 页消费）。
//
// 只读本地 SQLite / meta，不触网、不触发同步。同步状态口径：
//   成功 = last_sync_result；待传 = outbox pending/claimed；失败 = 核心实体 sync_status='failed'；
//   停放 = outbox parked（附 last_error 原文）；冲突 = conflicts status='open'。

import type { SqlDatabase } from '../db/database'
import { TABLE_COLUMNS } from '../db/schema'
import { getBoundOwner, getLastSyncAt, getLastSyncResult, type SyncResult } from '../sync/meta'
import { listOpenConflicts, type ConflictRow } from '../sync/conflicts'
import type { OutboxRow } from '../sync/outbox'

export interface ParkedOp {
  opId: string
  kind: string
  entityId: string | null
  attempts: number
  lastError: string | null
  parkedAt: string | null
}

export interface SyncSummary {
  owner: string | null
  pendingCount: number
  claimedCount: number
  parked: ParkedOp[]
  failedEntities: { table: string; id: string; error: string | null }[]
  conflictCount: number
  lastSyncAt: string | null
  lastSyncResult: SyncResult | null
}

const CORE_TABLES = ['places', 'entries', 'tag_dimensions', 'tags'] as const

/** 汇总本地同步状态，供 Mine 页一次读取。 */
export function getSyncSummary(db: SqlDatabase): SyncSummary {
  const pending =
    db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'")?.n ?? 0
  const claimed =
    db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE status = 'claimed'")?.n ?? 0

  const parked = db
    .getAllSync<{
      op_id: string
      kind: string
      entity_id: string | null
      attempts: number
      last_error: string | null
      parked_at: string | null
    }>("SELECT op_id, kind, entity_id, attempts, last_error, parked_at FROM outbox WHERE status = 'parked' ORDER BY seq ASC")
    .map((row) => ({
      opId: row.op_id,
      kind: row.kind,
      entityId: row.entity_id,
      attempts: row.attempts,
      lastError: row.last_error,
      parkedAt: row.parked_at,
    }))

  const failedEntities: SyncSummary['failedEntities'] = []
  for (const table of CORE_TABLES) {
    // 只有 places/entries 有 sync_error 列（tags/tag_dimensions 无，见 schema）；缺失时补 NULL，避免 no such column 白屏。
    const errorSelect = TABLE_COLUMNS[table].includes('sync_error') ? 'sync_error' : 'NULL AS sync_error'
    const rows = db.getAllSync<{ id: string; sync_error: string | null }>(
      `SELECT id, ${errorSelect} FROM ${table} WHERE sync_status = 'failed' ORDER BY updated_at ASC`,
    )
    for (const row of rows) failedEntities.push({ table, id: row.id, error: row.sync_error })
  }

  return {
    owner: getBoundOwner(db) ?? null,
    pendingCount: pending,
    claimedCount: claimed,
    parked,
    failedEntities,
    conflictCount: listOpenConflicts(db).length,
    lastSyncAt: getLastSyncAt(db) ?? null,
    lastSyncResult: getLastSyncResult(db) ?? null,
  }
}

/** 全部 outbox 行（按入队序），供诊断/“待传”列表。 */
export function listOutboxRows(db: SqlDatabase): OutboxRow[] {
  return db.getAllSync<OutboxRow>('SELECT * FROM outbox ORDER BY seq ASC')
}

/** 未裁决冲突（带快照原文，供 Conflicts 页展示双方内容）。 */
export function listOpenConflictRows(db: SqlDatabase): ConflictRow[] {
  return listOpenConflicts(db)
}

/** 冲突实体的人类可读标题（尽量取本地/远端快照名称）。 */
export function describeConflict(row: ConflictRow): { title: string; kindLabel: string } {
  const kindLabels: Record<string, string> = {
    place: '地点',
    entry: '记录',
    tag: '标签',
    dimension: '维度',
    media: '媒体',
    share: '分享',
  }
  const local = parseSnapshotName(row.local_snapshot)
  const remote = parseSnapshotName(row.remote_snapshot)
  const title = local ?? remote ?? row.entity_id
  return { title, kindLabel: kindLabels[row.entity_kind] ?? row.entity_kind }
}

function parseSnapshotName(snapshot: string | null): string | null {
  if (!snapshot) return null
  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>
    for (const key of ['name', 'title', 'place_name']) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) return value
    }
    const visit = parsed.visit_date
    if (typeof visit === 'string' && visit) return `到访 ${visit}`
    return null
  } catch {
    return null
  }
}
