import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createFakeGateway } from '../../test/fakeSyncGateway'
import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { createOutbox } from '../outbox'
import { createPullEngine } from '../pull'
import { setBoundOwner } from '../meta'
import { DEFAULT_PULL_PAGE_SIZE, createSupabasePullSource } from '../supabasePull'

const OWNER = 'owner-1'

function remotePlaces(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `cloud-${i + 1}`,
    coord_precision: 'exact',
    is_private: false,
    revision: 1,
  }))
}

describe('真 PullSource：分页', () => {
  it('按 id 升序翻页 range(offset, offset+limit-1)，不足一页即停', async () => {
    const gateway = createFakeGateway({ remote: { places: remotePlaces(5) } })
    const source = createSupabasePullSource({ gateway, pageSize: 2 })

    const snapshot = await source.fetchAll()

    expect(snapshot.places?.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    const placePages = gateway.calls.filter((c) => c.op === 'select' && c.table === 'places')
    expect(placePages.map((c) => c.options?.offset)).toEqual([0, 2, 4])
    expect(placePages.map((c) => c.options?.limit)).toEqual([2, 2, 2])
    expect(placePages.every((c) => c.options?.orderBy?.column === 'id')).toBe(true)
  })

  it('默认页大小覆盖 4 张核心实体表', async () => {
    const gateway = createFakeGateway()
    const source = createSupabasePullSource({ gateway })

    const snapshot = await source.fetchAll()

    expect(Object.keys(snapshot).sort()).toEqual(['entries', 'places', 'tag_dimensions', 'tags'])
    expect(gateway.calls.filter((c) => c.op === 'select').map((c) => c.table)).toEqual([
      'places',
      'entries',
      'tag_dimensions',
      'tags',
    ])
    expect(DEFAULT_PULL_PAGE_SIZE).toBe(1000)
  })

  it('分页中途报错 → 抛错（由 pull 超时/重试接管，不落半份快照）', async () => {
    const gateway = createFakeGateway({ selectErrorTable: 'entries' })
    const source = createSupabasePullSource({ gateway })

    await expect(source.fetchAll()).rejects.toThrow(/entries 拉取失败/)
  })
})

describe('真 PullSource：与 merge 复用', () => {
  it('分页快照交给 pull 引擎，本地缺失行采纳并置 synced', async () => {
    const db: SqlDatabase = createNodeSqliteDatabase()
    applyConnectionPragmas(db)
    runMigrations(db)
    setBoundOwner(db, OWNER)
    const outbox = createOutbox(db)
    const gateway = createFakeGateway({ remote: { places: remotePlaces(1) } })
    const source = createSupabasePullSource({ gateway, pageSize: 2 })

    const result = await createPullEngine({ db, source, outbox }).run({ currentUserId: OWNER })

    expect(result.applied).toBe(1)
    const local = db.getFirstSync<{ name: string; revision: number; base_revision: number; sync_status: string }>(
      'SELECT name, revision, base_revision, sync_status FROM places WHERE id = ?',
      'p1',
    )
    expect(local).toMatchObject({ name: 'cloud-1', revision: 1, base_revision: 1, sync_status: 'synced' })
  })
})
