import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import {
  acquireSyncLock,
  getBoundOwner,
  getLastSyncResult,
  getParkedOps,
  isParked,
  isSyncLocked,
  parkOp,
  pruneParkedOps,
  releaseSyncLock,
  setBoundOwner,
  setLastSyncResult,
  SYNC_LOCK_STALE_MS,
} from '../meta'

function setup(): SqlDatabase {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return db
}

describe('meta: owner / 同步结果', () => {
  it('持久化 bound_owner_user_id 与 last_sync_result（JSON 往返）', () => {
    const db = setup()
    setBoundOwner(db, 'owner-a')
    expect(getBoundOwner(db)).toBe('owner-a')

    setLastSyncResult(db, { at: '2026-09-18T00:00:00.000Z', done: 2, failed: 1, parked: 0 })
    expect(getLastSyncResult(db)).toMatchObject({ done: 2, failed: 1 })
  })
})

describe('meta: stale 同步锁', () => {
  it('有效锁内不可重复获取；超 stale 阈值可接管', () => {
    const db = setup()
    const t0 = Date.parse('2026-09-18T00:00:00.000Z')

    expect(acquireSyncLock(db, t0)).toBe(true)
    expect(isSyncLocked(db, t0 + 1000)).toBe(true)
    expect(acquireSyncLock(db, t0 + 1000)).toBe(false)

    expect(isSyncLocked(db, t0 + SYNC_LOCK_STALE_MS + 1)).toBe(false)
    expect(acquireSyncLock(db, t0 + SYNC_LOCK_STALE_MS + 1)).toBe(true)

    releaseSyncLock(db)
    expect(isSyncLocked(db)).toBe(false)
  })
})

describe('meta: 停放表', () => {
  it('parkOp/isParked 与超 TTL 清理', () => {
    const db = setup()
    const t0 = Date.parse('2026-09-18T00:00:00.000Z')
    parkOp(db, 'upsert_place:p1', t0)
    parkOp(db, 'upsert_entry:e1', t0)

    expect(isParked(db, 'upsert_place:p1', t0 + 1000)).toBe(true)
    expect(getParkedOps(db)).toEqual({ 'upsert_place:p1': t0, 'upsert_entry:e1': t0 })

    const pruned = pruneParkedOps(db, t0 + 25 * 60 * 60 * 1000)
    expect(pruned).toEqual({})
    expect(isParked(db, 'upsert_place:p1', t0 + 25 * 60 * 60 * 1000)).toBe(false)
  })
})
