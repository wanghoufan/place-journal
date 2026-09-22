// meta 键值层（T020 的本地结构部分）：同步时间/结果、stale lock、停放表。
//
// value 一律 JSON 编码存入 `meta.value`。仅本地结构与单元，不接网络。
// 口径对齐 Web `src/lib/sync.ts`：`syncing` 用 ISO 时间戳判 stale；`parked_ops`
// 为 `opKey -> epoch ms` 映射，超 `PARK_MS` 自动清理。

import type { SqlDatabase } from '../db/database'

export type MetaKey =
  | 'db_version'
  | 'bound_owner_user_id'
  | 'last_sync_at'
  | 'last_sync_result'
  | 'syncing_lock'
  | 'parked_ops'
  | 'demo_seeded'
  | 'app_theme'
  | 'gallery_layout'

export interface SyncResult {
  at: string
  done: number
  failed: number
  parked: number
  error?: string
}

/** 同步锁残留判定阈值（对齐 Web SYNCING_STALE_MS 的保守值）。 */
export const SYNC_LOCK_STALE_MS = 2 * 60 * 1000
/** 停放表清理阈值（与 outbox PARK_MS 一致）。 */
export const PARKED_OPS_TTL_MS = 24 * 60 * 60 * 1000

function nowIso(): string {
  return new Date().toISOString()
}

export function getMeta<T>(db: SqlDatabase, key: MetaKey): T | undefined {
  const row = db.getFirstSync<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', key)
  if (!row || row.value == null) return undefined
  try {
    return JSON.parse(row.value) as T
  } catch {
    return undefined
  }
}

export function setMeta(db: SqlDatabase, key: MetaKey, value: unknown): void {
  db.runSync(
    `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value ?? null),
    nowIso(),
  )
}

export function deleteMeta(db: SqlDatabase, key: MetaKey): void {
  db.runSync('DELETE FROM meta WHERE key = ?', key)
}

export function getAllMeta(db: SqlDatabase): Record<string, unknown> {
  const rows = db.getAllSync<{ key: string; value: string | null }>('SELECT key, value FROM meta')
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      out[row.key] = row.value == null ? null : JSON.parse(row.value)
    } catch {
      out[row.key] = row.value
    }
  }
  return out
}

// ── owner binding ──────────────────────────────────────────────────────────

export function getBoundOwner(db: SqlDatabase): string | undefined {
  return getMeta<string>(db, 'bound_owner_user_id') ?? undefined
}

export function setBoundOwner(db: SqlDatabase, ownerUserId: string | null): void {
  setMeta(db, 'bound_owner_user_id', ownerUserId)
}

// ── 同步结果 ───────────────────────────────────────────────────────────────

export function getLastSyncAt(db: SqlDatabase): string | undefined {
  return getMeta<string>(db, 'last_sync_at') ?? undefined
}

export function setLastSyncAt(db: SqlDatabase, at: string = nowIso()): void {
  setMeta(db, 'last_sync_at', at)
}

export function getLastSyncResult(db: SqlDatabase): SyncResult | undefined {
  return getMeta<SyncResult>(db, 'last_sync_result') ?? undefined
}

export function setLastSyncResult(db: SqlDatabase, result: SyncResult): void {
  setMeta(db, 'last_sync_result', result)
}

// ── 同步锁（stale 可接管）──────────────────────────────────────────────────

export function getSyncLockStartedAt(db: SqlDatabase): string | undefined {
  return getMeta<string>(db, 'syncing_lock') ?? undefined
}

/** 是否仍被有效锁占用（未超 stale 阈值）。 */
export function isSyncLocked(db: SqlDatabase, now: number = Date.now()): boolean {
  const at = getSyncLockStartedAt(db)
  if (!at) return false
  const parsed = Date.parse(at)
  if (Number.isNaN(parsed)) return false
  return now - parsed < SYNC_LOCK_STALE_MS
}

/** 尝试获取锁：已被有效占用返回 false；残留锁可接管。 */
export function acquireSyncLock(db: SqlDatabase, now: number = Date.now()): boolean {
  if (isSyncLocked(db, now)) return false
  setMeta(db, 'syncing_lock', new Date(now).toISOString())
  return true
}

export function releaseSyncLock(db: SqlDatabase): void {
  setMeta(db, 'syncing_lock', null)
}

// ── 停放表（opKey -> epoch ms）────────────────────────────────────────────

export function getParkedOps(db: SqlDatabase): Record<string, number> {
  return getMeta<Record<string, number>>(db, 'parked_ops') ?? {}
}

export function setParkedOps(db: SqlDatabase, ops: Record<string, number>): void {
  setMeta(db, 'parked_ops', ops)
}

/** 清理超过 TTL 的停放记录，返回清理后的映射。 */
export function pruneParkedOps(
  db: SqlDatabase,
  now: number = Date.now(),
  ttlMs: number = PARKED_OPS_TTL_MS,
): Record<string, number> {
  const ops = getParkedOps(db)
  let changed = false
  for (const key of Object.keys(ops)) {
    if (now - ops[key] > ttlMs) {
      delete ops[key]
      changed = true
    }
  }
  if (changed) setParkedOps(db, ops)
  return ops
}

/** 记录某 opKey 的停放时间（epoch ms）。 */
export function parkOp(db: SqlDatabase, opKey: string, now: number = Date.now()): void {
  const ops = getParkedOps(db)
  ops[opKey] = now
  setParkedOps(db, ops)
}

/** 该 opKey 是否仍在停放期内。 */
export function isParked(
  db: SqlDatabase,
  opKey: string,
  now: number = Date.now(),
  ttlMs: number = PARKED_OPS_TTL_MS,
): boolean {
  const at = getParkedOps(db)[opKey]
  return at != null && now - at < ttlMs
}
