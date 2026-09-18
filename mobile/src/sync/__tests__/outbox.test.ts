import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { MAX_ATTEMPTS, createOutbox, rowToOp, type Outbox } from '../outbox'

function setup(): { db: SqlDatabase; outbox: Outbox } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, outbox: createOutbox(db) }
}

describe('outbox: 入队与顺序', () => {
  it('按入队顺序（seq 升序）持久化，op_id 唯一', () => {
    const { db, outbox } = setup()
    const a = outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' })
    outbox.enqueue({ kind: 'upsert_entry', entityId: 'e1' })
    const c = outbox.enqueue({ kind: 'delete_tags', entityIds: ['t1', 't2'], dependsOn: [a] })

    const rows = outbox.list()
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3])
    expect(rows[0]).toMatchObject({ op_id: a, kind: 'upsert_place', status: 'pending', attempts: 0 })
    expect(rowToOp(rows[2])).toMatchObject({ kind: 'delete_tags', entityIds: ['t1', 't2'], dependsOn: [a] })
    expect(outbox.pendingCount()).toBe(3)
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n).toBe(3)
    expect(c).toBeTruthy()
  })

  it('重复 op_id 触发唯一约束（幂等键）', () => {
    const { outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'dup' })
    expect(() => outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' }, { opId: 'dup' })).toThrow()
    expect(outbox.list()).toHaveLength(1)
  })
})

describe('outbox: 认领', () => {
  it('认领只取 pending、按 seq 升序、标记 claimed', () => {
    const { outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' })
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p2' })
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p3' })

    const claimed = outbox.claim(2, '2026-09-18T00:00:00.000Z')
    expect(claimed.map((r) => r.entity_id)).toEqual(['p1', 'p2'])
    expect(claimed[0]).toMatchObject({ status: 'claimed', claimed_at: '2026-09-18T00:00:00.000Z' })

    expect(outbox.claim(5).map((r) => r.entity_id)).toEqual(['p3'])
    expect(outbox.list().every((r) => r.status === 'claimed')).toBe(true)
  })

  it('complete 删除 op；releaseStaleClaims 释放进程中断遗留的锁', () => {
    const { outbox } = setup()
    const opId = outbox.enqueue({ kind: 'upload_media', entityId: 'm1' })
    outbox.claim(1, '2026-09-18T00:00:00.000Z')

    expect(outbox.releaseStaleClaims('2026-09-18T00:01:00.000Z', 2 * 60 * 1000)).toBe(0)
    expect(outbox.releaseStaleClaims('2026-09-18T00:10:00.000Z', 2 * 60 * 1000)).toBe(1)
    expect(outbox.get(opId)?.status).toBe('pending')

    outbox.complete(opId)
    expect(outbox.get(opId)).toBeNull()
    expect(outbox.pendingCount()).toBe(0)
  })
})

describe('outbox: 重试计数与停放', () => {
  it('失败累加 attempts/last_error；达阈值转 parked', () => {
    const { outbox } = setup()
    const opId = outbox.enqueue({ kind: 'upsert_entry', entityId: 'e1' })

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const row = outbox.fail(opId, `err-${i}`, '2026-09-18T00:00:00.000Z')
      expect(row).toMatchObject({ attempts: i, status: 'pending', last_error: `err-${i}` })
    }

    const parked = outbox.fail(opId, 'poison', '2026-09-18T00:05:00.000Z')
    expect(parked).toMatchObject({ attempts: MAX_ATTEMPTS, status: 'parked', parked_at: '2026-09-18T00:05:00.000Z' })

    // 停放后不再被认领，也不计入待办
    expect(outbox.claim(10)).toHaveLength(0)
    expect(outbox.pendingCount()).toBe(0)
  })

  it('fail 对已停放 op 幂等；unpark 可复活', () => {
    const { outbox } = setup()
    const opId = outbox.enqueue({ kind: 'revoke_share', entityId: 's1' })
    for (let i = 0; i < MAX_ATTEMPTS; i++) outbox.fail(opId, 'x')

    expect(outbox.fail(opId, 'again')).toMatchObject({ status: 'parked' })
    outbox.unpark(opId)
    expect(outbox.get(opId)).toMatchObject({ status: 'pending', parked_at: null })
    expect(outbox.pendingCount()).toBe(1)
  })

  it('park 直接停放', () => {
    const { outbox } = setup()
    const opId = outbox.enqueue({ kind: 'create_share', entityId: 's1' })
    outbox.park(opId, '2026-09-18T00:00:00.000Z')
    expect(outbox.get(opId)).toMatchObject({ status: 'parked', parked_at: '2026-09-18T00:00:00.000Z' })
  })
})
