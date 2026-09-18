import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../database'
import { runMigrations } from '../migrations'
import { createRepository, type Repository } from '../repository'
import type { OutboxOp } from '../../sync/outbox'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, repo: createRepository(db) }
}

function outboxCount(db: SqlDatabase): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n ?? 0
}

const PLACE_ROW = {
  id: 'p1',
  name: '西海岸日落咖啡',
  area: '海口 · 西海岸',
  coord_precision: 'exact',
  is_private: 0,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
}

describe('repository: 版本与 dirty guard', () => {
  it('核心实体每次保存 revision+1、base_revision 保持、sync_status=local', () => {
    const { repo } = setup()

    repo.saveCoreEntity('places', { ...PLACE_ROW })
    let row = repo.get<{ revision: number; base_revision: number | null; sync_status: string }>('places', 'p1')
    expect(row).toMatchObject({ revision: 1, base_revision: null, sync_status: 'local' })
    expect(repo.isDirty(row!)).toBe(true)

    repo.saveCoreEntity('places', { ...PLACE_ROW, revision: 1 })
    row = repo.get('places', 'p1')
    expect(row?.revision).toBe(2)

    repo.markSynced('places', 'p1', 7)
    row = repo.get('places', 'p1')
    expect(row).toMatchObject({ revision: 7, base_revision: 7, sync_status: 'synced' })
    expect(repo.isDirty(row!)).toBe(false)
    expect(repo.listDirty('places')).toHaveLength(0)
  })

  it('markFailed / markConflict 保留 dirty 供自愈重推', () => {
    const { repo } = setup()
    repo.saveCoreEntity('places', { ...PLACE_ROW })
    repo.markSynced('places', 'p1', 1)

    repo.markFailed('places', 'p1', 'net down')
    expect(repo.get<{ sync_status: string; sync_error: string }>('places', 'p1')).toMatchObject({
      sync_status: 'failed',
      sync_error: 'net down',
    })
    expect(repo.listDirty('places')).toHaveLength(1)

    repo.markConflict('places', 'p1', 'revision mismatch')
    expect(repo.get<{ sync_status: string }>('places', 'p1')?.sync_status).toBe('conflict')
  })

  it('isDirty 口径：base_revision 为空且 revision 未上云算脏；相等算净', () => {
    const { repo } = setup()
    expect(repo.isDirty({ revision: 1, base_revision: null, sync_status: 'local' })).toBe(true)
    expect(repo.isDirty({ revision: 3, base_revision: 3, sync_status: 'synced' })).toBe(false)
    expect(repo.isDirty({ revision: 4, base_revision: 3, sync_status: 'synced' })).toBe(true)
  })
})

describe('repository: 事务原子（成功同成、失败回滚）', () => {
  it('saveEntityWithOutbox：实体与 outbox 同事务落盘', () => {
    const { db, repo } = setup()
    const op: OutboxOp = { kind: 'upsert_place', entityId: 'p1' }

    const opId = repo.saveEntityWithOutbox('places', { ...PLACE_ROW }, op)

    expect(repo.get('places', 'p1')).not.toBeNull()
    expect(outboxCount(db)).toBe(1)
    const row = db.getFirstSync<{ op_id: string; kind: string; entity_id: string; status: string }>(
      'SELECT * FROM outbox',
    )
    expect(row).toMatchObject({ op_id: opId, kind: 'upsert_place', entity_id: 'p1', status: 'pending' })
  })

  it('入队失败时实体写入一并回滚（不出现“实体在、op 丢”）', () => {
    const { db, repo } = setup()
    const badOp = { kind: 'not_a_real_kind', entityId: 'p1' } as unknown as OutboxOp

    expect(() => repo.saveEntityWithOutbox('places', { ...PLACE_ROW }, badOp)).toThrow()

    expect(repo.get('places', 'p1')).toBeNull()
    expect(outboxCount(db)).toBe(0)
  })

  it('未捕获异常导致事务整体回滚', () => {
    const { db, repo } = setup()

    expect(() =>
      repo.transaction((tx) => {
        repo.upsert('places', { ...PLACE_ROW })
        tx.runSync('INSERT INTO outbox (op_id, kind, created_at) VALUES (?, ?, ?)', 'op-x', 'upsert_place', 'now')
        throw new Error('rollback me')
      }),
    ).toThrow('rollback me')

    expect(repo.get('places', 'p1')).toBeNull()
    expect(outboxCount(db)).toBe(0)
  })
})

describe('repository: 冲突记录', () => {
  it('addConflict 保留本地快照与期望 revision', () => {
    const { db, repo } = setup()
    repo.addConflict({
      entityId: 'e1',
      entityKind: 'entry',
      expectedRevision: 3,
      localSnapshot: { note_public: '本地' },
      remoteSnapshot: { note_public: '云端' },
      now: '2026-09-18T02:00:00.000Z',
    })

    const row = db.getFirstSync<{
      entity_id: string
      expected_revision: number
      local_snapshot: string
      remote_snapshot: string
      status: string
    }>('SELECT * FROM conflicts')
    expect(row).toMatchObject({ entity_id: 'e1', expected_revision: 3, status: 'open' })
    expect(JSON.parse(row!.local_snapshot)).toEqual({ note_public: '本地' })
    expect(JSON.parse(row!.remote_snapshot)).toEqual({ note_public: '云端' })
  })
})

describe('repository: 返工 P1-1/P1-2/P1-3', () => {
  it('P1-1 revision 不回退：DB=5 时传入旧 revision=1 得 6', () => {
    const { repo } = setup()
    repo.saveCoreEntity('places', { ...PLACE_ROW })
    repo.markSynced('places', 'p1', 5)

    repo.saveCoreEntity('places', { ...PLACE_ROW, revision: 1 })

    expect(repo.get<{ revision: number }>('places', 'p1')?.revision).toBe(6)
  })

  it('P1-2 未显式传 base_revision 时沿用 DB 现有值（markSynced 7 后保持 7）', () => {
    const { repo } = setup()
    repo.saveCoreEntity('places', { ...PLACE_ROW })
    repo.markSynced('places', 'p1', 7)

    repo.saveCoreEntity('places', { ...PLACE_ROW, revision: 7 })

    expect(repo.get('places', 'p1')).toMatchObject({ revision: 8, base_revision: 7 })
  })

  it('P1-3 removeWithOutbox：同事务删除 + 入队', () => {
    const { db, repo } = setup()
    repo.saveCoreEntity('places', { ...PLACE_ROW })

    const opId = repo.removeWithOutbox('places', 'p1', { kind: 'delete_place', entityId: 'p1' })

    expect(repo.get('places', 'p1')).toBeNull()
    expect(outboxCount(db)).toBe(1)
    const op = db.getFirstSync<{ op_id: string; kind: string; status: string }>('SELECT * FROM outbox')
    expect(op).toMatchObject({ op_id: opId, kind: 'delete_place', status: 'pending' })
  })
})

describe('repository: 参数化白名单', () => {
  it('未知列被拒绝（防拼写漂移/注入）', () => {
    const { repo } = setup()
    expect(() => repo.upsert('places', { id: 'p2', name: 'x', drop_table: 1 })).toThrow(/未知列/)
  })
})

describe('repository: 无 sync_error 列的表不清该列（防 no such column）', () => {
  it('tags 的 markSynced/markFailed/markConflict 正常且不引用 sync_error', () => {
    const { db, repo } = setup()
    db.runSync('INSERT INTO tag_dimensions (id, name, kind) VALUES (?, ?, ?)', 'd1', '地区', 'region')
    db.runSync('INSERT INTO tags (id, dimension_id, name) VALUES (?, ?, ?)', 't1', 'd1', '海口')

    repo.markSynced('tags', 't1', 3)
    expect(repo.get('tags', 't1')).toMatchObject({ revision: 3, base_revision: 3, sync_status: 'synced' })

    repo.markFailed('tags', 't1', 'net down')
    expect(repo.get<{ sync_status: string }>('tags', 't1')?.sync_status).toBe('failed')

    repo.markConflict('tags', 't1', 'revision mismatch')
    expect(repo.get<{ sync_status: string }>('tags', 't1')?.sync_status).toBe('conflict')
  })
})
