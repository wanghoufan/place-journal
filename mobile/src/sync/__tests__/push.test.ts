import { applyConnectionPragmas } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { OwnerBindingBlockedError } from '../../supabase/owner'
import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { setBoundOwner } from '../meta'
import { createOutbox, MAX_ATTEMPTS, type Outbox } from '../outbox'
import { createPushEngine, PushDagError } from '../push'
import { createMockTransport } from '../transport'

const OWNER = 'owner-1'

function setup(): { db: ReturnType<typeof createNodeSqliteDatabase>; outbox: Outbox } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  const outbox = createOutbox(db)
  setBoundOwner(db, OWNER)
  return { db, outbox }
}

describe('push: owner 前置门禁', () => {
  it('owner mismatch 整体阻断：不认领、不发送、数据不动', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport()

    await expect(
      createPushEngine({ db, outbox, transport }).run({ currentUserId: 'other-owner' }),
    ).rejects.toBeInstanceOf(OwnerBindingBlockedError)

    expect(transport.calls).toHaveLength(0)
    expect(outbox.get('A')).toMatchObject({ status: 'pending', attempts: 0 })
  })
})

describe('push: DAG 调度', () => {
  it('按 dependsOn 解锁：子先入队也先跑父；且固定先 releaseStaleClaims 再 claim', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upload_media', entityId: 'm1', dependsOn: ['A'] }, { opId: 'B' })
    outbox.enqueue({ kind: 'upsert_entry', entityId: 'e1' }, { opId: 'A' })

    const callOrder: string[] = []
    const wrapped: Outbox = {
      ...outbox,
      releaseStaleClaims: (now, ttlMs) => {
        callOrder.push('release')
        return outbox.releaseStaleClaims(now, ttlMs)
      },
      claim: (limit, now) => {
        callOrder.push('claim')
        return outbox.claim(limit, now)
      },
    }
    const transport = createMockTransport()
    const result = await createPushEngine({ db, outbox: wrapped, transport }).run({ currentUserId: OWNER })

    expect(transport.calls.map((c) => c.opId)).toEqual(['A', 'B'])
    expect(result.done).toEqual(['A', 'B'])
    expect(callOrder).toEqual(['release', 'claim'])
    expect(outbox.pendingCount()).toBe(0)
  })

  it('父失败时子不跑：子保持 pending、attempts 不计', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_entry', entityId: 'e1' }, { opId: 'A' })
    outbox.enqueue({ kind: 'upload_media', entityId: 'm1', dependsOn: ['A'] }, { opId: 'B' })

    const transport = createMockTransport((op) =>
      op.opId === 'A' ? { outcome: 'retry', error: 'boom' } : { outcome: 'ok' },
    )
    const result = await createPushEngine({ db, outbox, transport }).run({ currentUserId: OWNER })

    expect(transport.calls.map((c) => c.opId)).toEqual(['A'])
    expect(result.failed).toEqual(['A'])
    expect(result.blocked).toEqual(['B'])
    expect(outbox.get('A')).toMatchObject({ status: 'pending', attempts: 1, last_error: 'boom' })
    expect(outbox.get('B')).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('transport 半成品（partial）算未成功：重试并阻断子', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upload_media', entityId: 'm1' }, { opId: 'A' })
    outbox.enqueue({ kind: 'upload_media', entityId: 'm2', dependsOn: ['A'] }, { opId: 'B' })

    const transport = createMockTransport((op) =>
      op.opId === 'A' ? { outcome: 'partial', completedSteps: ['display'] } : { outcome: 'ok' },
    )
    const result = await createPushEngine({ db, outbox, transport }).run({ currentUserId: OWNER })

    expect(transport.calls.map((c) => c.opId)).toEqual(['A'])
    expect(result.failed).toEqual(['A'])
    expect(result.blocked).toEqual(['B'])
    expect(outbox.get('A')?.last_error).toContain('display')
  })

  it('缺父报错并归还 claimed', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upload_media', entityId: 'm1', dependsOn: ['GHOST'] }, { opId: 'B' })
    const transport = createMockTransport()

    await expect(createPushEngine({ db, outbox, transport }).run({ currentUserId: OWNER })).rejects.toMatchObject({
      reason: 'missing_parent',
    })
    expect(transport.calls).toHaveLength(0)
    expect(outbox.get('B')?.status).toBe('pending')
  })

  it('依赖成环报错并归还 claimed', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1', dependsOn: ['B'] }, { opId: 'A' })
    outbox.enqueue({ kind: 'upsert_entry', entityId: 'e1', dependsOn: ['A'] }, { opId: 'B' })
    const transport = createMockTransport()

    await expect(createPushEngine({ db, outbox, transport }).run({ currentUserId: OWNER })).rejects.toBeInstanceOf(
      PushDagError,
    )
    expect(transport.calls).toHaveLength(0)
    expect(outbox.get('A')?.status).toBe('pending')
    expect(outbox.get('B')?.status).toBe('pending')
  })

  it('alreadyDoneOpIds 声明历史父成功，子可续跑', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upload_media', entityId: 'm1', dependsOn: ['PARENT'] }, { opId: 'CHILD' })
    const transport = createMockTransport()

    const result = await createPushEngine({ db, outbox, transport }).run({
      currentUserId: OWNER,
      alreadyDoneOpIds: ['PARENT'],
    })

    expect(result.done).toEqual(['CHILD'])
    expect(transport.calls.map((c) => c.opId)).toEqual(['CHILD'])
  })
})

describe('push: 重试、停放与超时', () => {
  it('失败累计 5 次转 parked，之后不再认领/发送', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    const transport = createMockTransport(() => ({ outcome: 'retry', error: 'net' }))
    const engine = createPushEngine({ db, outbox, transport })

    let last = await engine.run({ currentUserId: OWNER })
    for (let i = 1; i < MAX_ATTEMPTS; i++) last = await engine.run({ currentUserId: OWNER })

    expect(last.parked).toEqual(['A'])
    expect(outbox.get('A')).toMatchObject({ status: 'parked', attempts: MAX_ATTEMPTS })
    expect(transport.calls).toHaveLength(MAX_ATTEMPTS)

    await engine.run({ currentUserId: OWNER })
    expect(transport.calls).toHaveLength(MAX_ATTEMPTS)
    expect(outbox.pendingCount()).toBe(0)
  })

  it('单 op 超时视为失败并释放回 pending（可重试）', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upload_media', entityId: 'm1' }, { opId: 'S' })
    const transport = createMockTransport(() => ({ delayMs: 40 }))

    const result = await createPushEngine({
      db,
      outbox,
      transport,
      config: { singleOpTimeoutMs: 5 },
    }).run({ currentUserId: OWNER })

    expect(result.failed).toEqual(['S'])
    expect(outbox.get('S')).toMatchObject({ status: 'pending', attempts: 1 })
    expect(outbox.get('S')?.last_error).toContain('超时')
  })

  it('整轮超时释放未处理的 claimed 回 pending', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p2' }, { opId: 'B' })
    const transport = createMockTransport()

    const result = await createPushEngine({
      db,
      outbox,
      transport,
      config: { roundTimeoutMs: 0 },
    }).run({ currentUserId: OWNER })

    expect(result.timedOut).toBe(true)
    expect(transport.calls).toHaveLength(0)
    expect(result.released).toEqual(expect.arrayContaining(['A', 'B']))
    expect(outbox.get('A')?.status).toBe('pending')
    expect(outbox.get('B')?.status).toBe('pending')
  })

  it('先恢复陈旧 claimed，再本轮认领处理', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'A' })
    outbox.claim(1, '2026-09-17T00:00:00.000Z')
    expect(outbox.get('A')?.status).toBe('claimed')

    const transport = createMockTransport()
    const result = await createPushEngine({ db, outbox, transport }).run({ currentUserId: OWNER })

    expect(result.done).toEqual(['A'])
    expect(transport.calls.map((c) => c.opId)).toEqual(['A'])
  })
})

describe('push: 幂等键', () => {
  it('transport 收到的幂等键 = outbox.op_id；成功后删除、重复运行不重发', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'KEY-1' })
    const transport = createMockTransport()
    const engine = createPushEngine({ db, outbox, transport })

    await engine.run({ currentUserId: OWNER })
    expect(transport.calls[0]?.opId).toBe('KEY-1')

    const second = await engine.run({ currentUserId: OWNER })
    expect(transport.calls).toHaveLength(1)
    expect(second.done).toHaveLength(0)
    expect(outbox.pendingCount()).toBe(0)
  })
})
