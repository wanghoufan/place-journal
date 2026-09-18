import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import { clearDemo, defaultTagRows, demoCount, seedDemo } from '../demo'
import { listGalleryEntries, listTagsGrouped } from '../queries'
import { saveRecord } from '../recordActions'
import { getMeta } from '../../sync/meta'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, repo: createRepository(db) }
}

function count(db: SqlDatabase, table: string, where = ''): number {
  return db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`)?.n ?? 0
}

describe('demo: 默认标签', () => {
  it('地区/类型/场景/人群 四维度 + 父子两层标签', () => {
    const { dimensions, tags, byName } = defaultTagRows('2026-09-18T00:00:00.000Z')

    expect(dimensions.map((d) => [d.name, d.kind])).toEqual([
      ['地区', 'region'],
      ['类型', 'type'],
      ['场景', 'scene'],
      ['人群', 'crowd'],
    ])
    expect(dimensions.every((d) => d.demo === 1 && d.sync_status === 'synced')).toBe(true)
    // 26 个标签：地区 3 + 类型 13 + 场景 6 + 人群 4
    expect(tags).toHaveLength(26)
    // 父子关系：海口市/儋州市 的父是 海南省
    const hainan = byName.get('海南省')!
    const haikou = tags.find((t) => t.name === '海口市')!
    expect(haikou.parent_id).toBe(hainan)
    expect(haikou.dimension_id).toBe(dimensions[0].id)
  })
})

describe('demo: 播种演示数据', () => {
  it('6 地点 / 7 记录（评分覆盖 3-4-5）/ 每记录 2 图，首图为封面；demo 标记且不上云', () => {
    const { db, repo } = setup()
    const result = seedDemo(db, repo, new Date('2026-09-18T12:00:00.000Z'))

    expect(result).toMatchObject({ places: 6, entries: 7, media: 14, skipped: false })
    expect(demoCount(db)).toBe(7)
    expect(count(db, 'places')).toBe(6)
    expect(count(db, 'media')).toBe(14)

    const ratings = db.getAllSync<{ rating: number }>('SELECT rating FROM entries WHERE demo = 1')
    expect(new Set(ratings.map((r) => r.rating))).toEqual(new Set([3, 4, 5]))

    // 默认标签已建齐并关联到演示记录
    expect(count(db, 'tag_dimensions')).toBe(4)
    expect(count(db, 'tags')).toBe(26)
    expect(count(db, 'entry_tags')).toBeGreaterThan(0)

    // demo 行永不上云：无 outbox、且不被判 dirty（不会被 push/pull 动到）
    expect(count(db, 'outbox')).toBe(0)
    for (const table of ['places', 'entries', 'tag_dimensions', 'tags'] as const) {
      expect(repo.listDirty(table)).toHaveLength(0)
    }
    expect(getMeta<boolean>(db, 'demo_seeded')).toBe(true)

    // 封面回退到 picsum demo_uri
    const entries = listGalleryEntries(db)
    expect(entries).toHaveLength(7)
    expect(entries.every((e) => (e.coverThumbPath ?? '').startsWith('https://picsum.photos/'))).toBe(true)
  })

  it('已有演示数据时跳过，不重复播种；组名与使用次数可读出', () => {
    const { db, repo } = setup()
    seedDemo(db, repo)
    const again = seedDemo(db, repo)

    expect(again.skipped).toBe(true)
    expect(demoCount(db)).toBe(7)
    expect(count(db, 'places')).toBe(6)

    const groups = listTagsGrouped(db)
    expect(groups).toHaveLength(4)
    expect(groups.flatMap((g) => g.tags).some((t) => t.usage > 0)).toBe(true)
  })
})

describe('demo: 清除演示数据', () => {
  it('只删 demo 行，用户自建记录与默认标签保留；标记 demo_seeded', () => {
    const { db, repo } = setup()
    seedDemo(db, repo)
    const mine = saveRecord(db, repo, { newPlace: { name: '我的地点' }, visitDate: '2026-09-18' })

    const removed = clearDemo(db)

    expect(removed).toBe(7)
    expect(demoCount(db)).toBe(0)
    expect(count(db, 'places')).toBe(1)
    expect(repo.get('entries', mine.entryId)).not.toBeNull()
    expect(count(db, 'tag_dimensions')).toBe(4)
    expect(count(db, 'tags')).toBe(26)
    expect(count(db, 'entry_tags')).toBe(0)
    expect(getMeta<boolean>(db, 'demo_seeded')).toBe(true)
  })

  it('清除后可再次手动播种（清除不复活指的是不自动恢复）', () => {
    const { db, repo } = setup()
    seedDemo(db, repo)
    clearDemo(db)

    const result = seedDemo(db, repo)

    expect(result.skipped).toBe(false)
    expect(demoCount(db)).toBe(7)
  })
})
