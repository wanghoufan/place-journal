import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import type { LoginState } from '../../supabase/auth'
import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import {
  getBoundOwner,
  getLastSyncResult,
  isSyncLocked,
  setBoundOwner,
} from '../../sync/meta'
import { createOutbox, type Outbox } from '../../sync/outbox'
import {
  createMockPullSource,
  type MockPullSource,
  type RemoteEntityRow,
} from '../../sync/pull'
import { createMockTransport, type MockTransport } from '../../sync/transport'
import { describeOwnerMismatch, describeUnboundHint } from '../account'
import {
  describeSyncEntry,
  runSyncEntry,
  SYNC_IN_FLIGHT_MESSAGE,
  SYNC_NOT_CONFIGURED_MESSAGE,
  SYNC_SIGNED_OUT_MESSAGE,
  type SyncEngines,
} from '../syncEntry'

// TASK-DEV-补线：同步入口接线（owner 门禁 + 引擎工厂）纯逻辑单测。
// 全部走内存 SQLite + mock transport/source，不 import 任何 Expo/Supabase 原生模块。

const OWNER = 'owner-1'
const OTHER = 'owner-2'

function setup(boundOwner: string | null = OWNER): { db: SqlDatabase; outbox: Outbox } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  const outbox = createOutbox(db)
  if (boundOwner) setBoundOwner(db, boundOwner)
  return { db, outbox }
}

function signedIn(userId: string, binding: 'unbound' | 'match' | 'mismatch'): LoginState {
  return { status: 'signed_in', userId, binding }
}

function remotePlace(revision: number): RemoteEntityRow {
  return {
    id: 'p1',
    name: '远端地点',
    coord_precision: 'exact',
    is_private: false,
    revision,
    updated_at: '2026-09-20T00:00:00.000Z',
  }
}

function insertPlace(db: SqlDatabase, id: string, name: string): void {
  db.runSync(
    `INSERT INTO places (id, name, coord_precision, is_private, revision, base_revision, demo, sync_status)
     VALUES (?, ?, 'exact', 0, 1, 1, 0, 'synced')`,
    id,
    name,
  )
}

function countPlaces(db: SqlDatabase): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM places')?.n ?? 0
}

/** 记录引擎工厂调用次数与最近一次产出（断言「阻断时不创建引擎」用）。 */
function spyFactory(engines: SyncEngines): { create: () => SyncEngines; calls: () => number } {
  let calls = 0
  return {
    create: () => {
      calls += 1
      return engines
    },
    calls: () => calls,
  }
}

function engines(transport: MockTransport, source: MockPullSource, owner = OWNER): SyncEngines {
  return { owner, transport, source }
}

describe('syncEntry: 前置跳过（不触网、不动数据）', () => {
  it('云端未配置：跳过且不创建引擎', async () => {
    const { db, outbox } = setup()
    const factory = spyFactory(engines(createMockTransport(), createMockPullSource({})))

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'match'),
      isConfigured: false,
      createEngines: factory.create,
    })

    expect(result).toEqual({
      status: 'skipped',
      reason: 'not_configured',
      message: SYNC_NOT_CONFIGURED_MESSAGE,
    })
    expect(factory.calls()).toBe(0)
  })

  it('未登录（含登录态未知）：跳过且不创建引擎', async () => {
    const { db, outbox } = setup()
    const factory = spyFactory(engines(createMockTransport(), createMockPullSource({})))

    for (const loginState of [{ status: 'signed_out' as const }, null]) {
      const result = await runSyncEntry({
        db,
        outbox,
        loginState,
        isConfigured: true,
        createEngines: factory.create,
      })
      expect(result).toEqual({
        status: 'skipped',
        reason: 'signed_out',
        message: SYNC_SIGNED_OUT_MESSAGE,
      })
    }
    expect(factory.calls()).toBe(0)
  })

  it('退出登录只清 auth 态：业务数据与 owner 绑定原样保留', async () => {
    const { db, outbox } = setup(OWNER)
    insertPlace(db, 'p1', '我的地点')
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const factory = spyFactory(engines(createMockTransport(), createMockPullSource({})))

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: { status: 'signed_out' },
      isConfigured: true,
      createEngines: factory.create,
    })

    expect(result).toMatchObject({ status: 'skipped', reason: 'signed_out' })
    expect(factory.calls()).toBe(0)
    expect(countPlaces(db)).toBe(1)
    expect(outbox.get('A')).toMatchObject({ status: 'pending' })
    expect(getBoundOwner(db)).toBe(OWNER)
  })
})

describe('syncEntry: owner 门禁（阻断走 account.ts 文案）', () => {
  it('owner 未绑定：文案＝未绑定提示，不创建引擎、不发送、不认领', async () => {
    const { db, outbox } = setup(null)
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport()
    const source = createMockPullSource({ places: [remotePlace(1)] })
    const factory = spyFactory(engines(transport, source))

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'unbound'),
      isConfigured: true,
      createEngines: factory.create,
    })

    expect(result).toEqual({ status: 'blocked', reason: 'unbound', message: describeUnboundHint() })
    expect(factory.calls()).toBe(0)
    expect(transport.calls).toHaveLength(0)
    expect(source.calls).toBe(0)
    expect(outbox.get('A')).toMatchObject({ status: 'pending' })
    expect(getLastSyncResult(db)).toBeUndefined()
  })

  it('owner mismatch：只给阻断＋重登原账号，不自动迁移、不跨号切号', async () => {
    const { db, outbox } = setup(OTHER)
    const transport = createMockTransport()
    const source = createMockPullSource({ places: [remotePlace(1)] })
    const factory = spyFactory(engines(transport, source))

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'mismatch'),
      isConfigured: true,
      createEngines: factory.create,
    })

    expect(result).toEqual({
      status: 'blocked',
      reason: 'mismatch',
      message: describeOwnerMismatch(OTHER),
    })
    if (result.status !== 'blocked') throw new Error('unreachable')
    expect(result.message).toContain('同步已阻断')
    expect(result.message).toContain('重新登录')
    expect(result.message).not.toContain('导出')
    expect(result.message).not.toContain('切号')
    expect(factory.calls()).toBe(0)
    expect(transport.calls).toHaveLength(0)
    expect(source.calls).toBe(0)
    expect(getBoundOwner(db)).toBe(OTHER)
  })
})

describe('syncEntry: match 时真正跑引擎', () => {
  it('push 先跑、pull 后跑，落 last_sync_result 且释放锁', async () => {
    const { db, outbox } = setup(OWNER)
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport()
    const source = createMockPullSource({ places: [remotePlace(1)] })

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'match'),
      isConfigured: true,
      createEngines: () => engines(transport, source),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.owner).toBe(OWNER)
    expect(transport.calls.map((c) => c.opId)).toEqual(['A'])
    expect(result.push.done).toEqual(['A'])
    expect(source.calls).toBe(1)
    expect(result.pull.applied).toBe(1)
    expect(countPlaces(db)).toBe(1)

    expect(getLastSyncResult(db)).toMatchObject({ done: 1, failed: 0, parked: 0 })
    expect(isSyncLocked(db)).toBe(false)
    expect(describeSyncEntry(result)).toContain('已完成同步：上传成功 1 项')
  })

  it('push 未成功时 pull 走 outbox 守卫，文案如实说明跳过', async () => {
    const { db, outbox } = setup(OWNER)
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport(() => ({ outcome: 'retry', error: 'net down' }))
    const source = createMockPullSource({ places: [remotePlace(1)] })

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'match'),
      isConfigured: true,
      createEngines: () => engines(transport, source),
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.push.failed).toEqual(['A'])
    expect(result.pull.skipped).toBe(true)
    expect(source.calls).toBe(0)
    expect(describeSyncEntry(result)).toContain('拉取已跳过（本地有待传写入）')
  })

  it('同一时刻只跑一轮：并发第二次为 in_flight，不重复发送', async () => {
    const { db, outbox } = setup(OWNER)
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport(() => ({ outcome: 'ok', delayMs: 5 }))
    const source = createMockPullSource({ places: [remotePlace(1)] })
    const deps = {
      db,
      outbox,
      loginState: signedIn(OWNER, 'match'),
      isConfigured: true,
      createEngines: () => engines(transport, source),
    }

    const [first, second] = await Promise.all([runSyncEntry(deps), runSyncEntry(deps)])

    const skipped = [first, second].find((r) => r.status === 'skipped')
    expect(skipped).toEqual({ status: 'skipped', reason: 'in_flight', message: SYNC_IN_FLIGHT_MESSAGE })
    expect(transport.calls).toHaveLength(1)
    expect(source.calls).toBe(1)
    expect(isSyncLocked(db)).toBe(false)
  })
})

describe('syncEntry: 运行期异常不静默、不卡锁', () => {
  it('门禁通过后 owner 才变：push 抛门禁错误 → 按 account.ts 口径阻断，零发送', async () => {
    const { db, outbox } = setup(OWNER)
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport()
    const source = createMockPullSource({ places: [remotePlace(1)] })

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'match'),
      isConfigured: true,
      createEngines: () => {
        setBoundOwner(db, OTHER) // 门禁通过后本机换绑（并发换号）
        return engines(transport, source)
      },
    })

    expect(result).toMatchObject({ status: 'blocked', reason: 'mismatch' })
    expect(transport.calls).toHaveLength(0)
    expect(source.calls).toBe(0)
    expect(outbox.get('A')).toMatchObject({ status: 'pending' })
    expect(isSyncLocked(db)).toBe(false)
  })

  it('引擎构建失败：报 error、记 last_sync_result.error、锁释放', async () => {
    const { db, outbox } = setup(OWNER)

    const result = await runSyncEntry({
      db,
      outbox,
      loginState: signedIn(OWNER, 'match'),
      isConfigured: true,
      createEngines: () => {
        throw new Error('SUPABASE_ENV_MISSING')
      },
    })

    expect(result).toEqual({ status: 'error', message: '同步失败：SUPABASE_ENV_MISSING' })
    expect(getLastSyncResult(db)).toMatchObject({ done: 0, failed: 0, error: 'SUPABASE_ENV_MISSING' })
    expect(isSyncLocked(db)).toBe(false)
    expect(describeSyncEntry(result)).toBe('同步失败：SUPABASE_ENV_MISSING')
  })
})

describe('syncEntry: describeSyncEntry 文案分支', () => {
  it('跳过/阻断/错误一律透传原文，不二次包装', () => {
    expect(
      describeSyncEntry({ status: 'skipped', reason: 'not_configured', message: SYNC_NOT_CONFIGURED_MESSAGE }),
    ).toBe(SYNC_NOT_CONFIGURED_MESSAGE)
    expect(
      describeSyncEntry({ status: 'blocked', reason: 'unbound', message: describeUnboundHint() }),
    ).toBe(describeUnboundHint())
    expect(describeSyncEntry({ status: 'error', message: '同步失败：boom' })).toBe('同步失败：boom')
  })

  it('成功但失败/停放时如实列出，不报「全部成功」', () => {
    const text = describeSyncEntry({
      status: 'ok',
      owner: OWNER,
      push: { done: [], failed: ['A'], parked: ['B'], blocked: [], released: [], timedOut: false },
      pull: { skipped: false, skipReason: null, timedOut: false, applied: 2, protectedCount: 0, conflicts: 1, noRevival: 0 },
    })
    expect(text).toContain('失败 1 项')
    expect(text).toContain('停放 1 项')
    expect(text).toContain('下行 2 项')
    expect(text).toContain('新增冲突 1 项')
  })
})
