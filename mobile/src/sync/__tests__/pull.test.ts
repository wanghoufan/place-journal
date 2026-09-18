import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { OwnerBindingBlockedError } from '../../supabase/owner'
import { createOutbox, type Outbox } from '../outbox'
import { setBoundOwner } from '../meta'
import { createMockPullSource, createPullEngine, type RemoteEntityRow } from '../pull'

const OWNER = 'owner-1'

function setup(): { db: SqlDatabase; outbox: Outbox } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  const outbox = createOutbox(db)
  setBoundOwner(db, OWNER)
  return { db, outbox }
}

interface PlaceSeed {
  id: string
  name: string
  revision?: number
  base_revision?: number | null
  sync_status?: string
}

function insertPlace(db: SqlDatabase, row: PlaceSeed): void {
  db.runSync(
    `INSERT INTO places (id, name, coord_precision, is_private, revision, base_revision, demo, sync_status)
     VALUES (?, ?, 'exact', 0, ?, ?, 0, ?)`,
    row.id,
    row.name,
    row.revision ?? 0,
    row.base_revision ?? null,
    row.sync_status ?? 'synced',
  )
}

function getPlace(db: SqlDatabase, id: string) {
  return db.getFirstSync<{ name: string; revision: number; base_revision: number | null; sync_status: string }>(
    'SELECT name, revision, base_revision, sync_status FROM places WHERE id = ?',
    id,
  )
}

function remotePlace(over: { id?: string; name?: string; revision: number }): RemoteEntityRow {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? 'remote',
    coord_precision: 'exact',
    is_private: false,
    revision: over.revision,
    updated_at: '2026-09-18T00:00:00.000Z',
  }
}

function countPlaces(db: SqlDatabase): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM places')?.n ?? 0
}

describe('pull: 前置守卫', () => {
  it('owner mismatch 整体阻断：不拉取、不落盘', async () => {
    const { db, outbox } = setup()
    const source = createMockPullSource({ places: [remotePlace({ revision: 1 })] })

    await expect(
      createPullEngine({ db, source, outbox }).run({ currentUserId: 'other-owner' }),
    ).rejects.toBeInstanceOf(OwnerBindingBlockedError)

    expect(source.calls).toBe(0)
    expect(countPlaces(db)).toBe(0)
  })

  it('outbox 非空（存在未确认 op）跳过拉取', async () => {
    const { db, outbox } = setup()
    outbox.enqueue({ kind: 'upsert_place', entityId: 'p1' })
    const source = createMockPullSource({ places: [remotePlace({ revision: 1 })] })

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.skipped).toBe(true)
    expect(result.skipReason).toBe('outbox')
    expect(source.calls).toBe(0)
    expect(countPlaces(db)).toBe(0)
  })

  it('拉取超时可配：超时即跳过、不落盘', async () => {
    const { db, outbox } = setup()
    const source = createMockPullSource({ places: [remotePlace({ revision: 1 })] }, { delayMs: 40 })

    const result = await createPullEngine({ db, source, outbox, config: { timeoutMs: 5 } }).run({
      currentUserId: OWNER,
    })

    expect(result.timedOut).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toBe('timeout')
    expect(countPlaces(db)).toBe(0)
  })
})

describe('pull: revision 合并', () => {
  it('本地缺失 → 采纳远端并置 synced（base=revision）', async () => {
    const { db, outbox } = setup()
    const source = createMockPullSource({ places: [remotePlace({ name: 'cloud', revision: 1 })] })

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.applied).toBe(1)
    expect(getPlace(db, 'p1')).toMatchObject({
      name: 'cloud',
      revision: 1,
      base_revision: 1,
      sync_status: 'synced',
    })
  })

  it('本地 clean 且远端 revision 更新 → 覆盖并推进 base', async () => {
    const { db, outbox } = setup()
    insertPlace(db, { id: 'p1', name: 'local', revision: 2, base_revision: 2, sync_status: 'synced' })
    const source = createMockPullSource({ places: [remotePlace({ name: 'cloud', revision: 3 })] })

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.applied).toBe(1)
    expect(getPlace(db, 'p1')).toMatchObject({
      name: 'cloud',
      revision: 3,
      base_revision: 3,
      sync_status: 'synced',
    })
  })

  it('本地 clean 且远端 revision 未前进 → 不动', async () => {
    const { db, outbox } = setup()
    insertPlace(db, { id: 'p1', name: 'local', revision: 2, base_revision: 2, sync_status: 'synced' })
    const source = createMockPullSource({ places: [remotePlace({ name: 'cloud', revision: 2 })] })

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.applied).toBe(0)
    expect(getPlace(db, 'p1')?.name).toBe('local')
  })

  it('本地 dirty 且远端未前进 → dirty guard 保护，不被覆盖', async () => {
    const { db, outbox } = setup()
    insertPlace(db, { id: 'p1', name: 'local-edit', revision: 5, base_revision: 2, sync_status: 'local' })
    const source = createMockPullSource({ places: [remotePlace({ name: 'cloud', revision: 2 })] })

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.protectedCount).toBe(1)
    expect(result.conflicts).toBe(0)
    expect(getPlace(db, 'p1')).toMatchObject({ name: 'local-edit', revision: 5, sync_status: 'local' })
  })

  it('本地 dirty 且远端越过共同 base → 分叉落 conflicts，本地内容保留', async () => {
    const { db, outbox } = setup()
    insertPlace(db, { id: 'p1', name: 'local-edit', revision: 5, base_revision: 2, sync_status: 'local' })
    const source = createMockPullSource({ places: [remotePlace({ name: 'cloud', revision: 4 })] })
    const engine = createPullEngine({ db, source, outbox })

    const first = await engine.run({ currentUserId: OWNER })
    expect(first.conflicts).toBe(1)
    expect(getPlace(db, 'p1')).toMatchObject({ name: 'local-edit', revision: 5, sync_status: 'conflict' })

    const conflicts = db.getAllSync<{ entity_id: string; status: string; local_snapshot: string }>(
      'SELECT entity_id, status, local_snapshot FROM conflicts',
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].entity_id).toBe('p1')
    expect(conflicts[0].status).toBe('open')

    // 重复拉取不重复登记同实体 open 冲突。
    const second = await engine.run({ currentUserId: OWNER })
    expect(second.conflicts).toBe(0)
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM conflicts')?.n).toBe(1)
  })
})

describe('pull: 删除防复活', () => {
  it('本地删除标记（已停放 delete_place）→ 远端同名行不复活', async () => {
    const { db, outbox } = setup()
    const opId = outbox.enqueue({ kind: 'delete_place', entityId: 'p1' })
    outbox.park(opId)
    expect(outbox.pendingCount()).toBe(0)

    const source = createMockPullSource({ places: [remotePlace({ name: 'zombie', revision: 9 })] })
    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.noRevival).toBe(1)
    expect(result.applied).toBe(0)
    expect(countPlaces(db)).toBe(0)
  })

  it('delete_entry 标记同样防复活（对齐 delete_entry 语义）', async () => {
    const { db, outbox } = setup()
    const opId = outbox.enqueue({ kind: 'delete_entry', entityId: 'e1' })
    outbox.park(opId)

    const source = createMockPullSource({
      entries: [
        {
          id: 'e1',
          place_id: 'p1',
          visit_date: '2026-09-18',
          revision: 4,
          coord_precision: 'exact',
        },
      ],
    })
    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.noRevival).toBe(1)
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n).toBe(0)
  })

  it('远端缺失本地已确认行 → 不删除本地（pull 不删本地行）', async () => {
    const { db, outbox } = setup()
    insertPlace(db, { id: 'p1', name: 'local', revision: 2, base_revision: 2, sync_status: 'synced' })
    const source = createMockPullSource({})

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.applied).toBe(0)
    expect(getPlace(db, 'p1')?.name).toBe('local')
  })
})
