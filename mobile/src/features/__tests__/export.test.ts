// 导出纯函数：读库打包 → JSON / CSV 序列化（与 Web `src/lib/exporter.ts` 同字段口径）。

import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import { exportFilename, readExportBundle, toExportCsv, toExportJson } from '../export'

function setup(): { db: ReturnType<typeof createNodeSqliteDatabase>; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, repo: createRepository(db) }
}

function seed(db: ReturnType<typeof createNodeSqliteDatabase>, repo: Repository): void {
  repo.saveCoreEntity('places', {
    id: 'p1',
    name: '海边咖啡',
    area: '海口 · 西海岸',
    coord_precision: 'exact',
    is_private: 0,
    demo: 0,
    created_at: '2026-09-01T00:00:00.000Z',
  })
  repo.saveCoreEntity('entries', {
    id: 'e1',
    place_id: 'p1',
    visit_date: '2026-09-18',
    rating: 5,
    budget: 45,
    summary: '海边的落日',
    note_public: '适合约会',
    note_private: '私密感受不外泄',
    is_private: 0,
    demo: 0,
    created_at: '2026-09-18T00:00:00.000Z',
  })
  repo.upsert('media', {
    id: 'm1',
    entry_id: 'e1',
    place_id: 'p1',
    local_display_path: 'file:///documents/m1/display.jpg',
    remote_path: 'exports/m1.jpg',
    sort_order: 0,
    sync_status: 'local',
    created_at: '2026-09-18T00:00:00.000Z',
  })
  repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })
  repo.saveCoreEntity('tags', { id: 't1', dimension_id: 'd1', name: '安静', sort_order: 0 })
  db.runSync("INSERT INTO entry_tags (entry_id, tag_id) VALUES ('e1', 't1')")
  db.runSync(
    `INSERT INTO share_snapshots (id, slug, kind, title, status, created_at)
     VALUES ('s1', 'abcdefghijklmnopqrstuv', 'single', '海边咖啡', 'active', '2026-09-18T10:00:00.000Z')`,
  )
}

const FIXED = new Date('2026-09-20T08:00:00.000Z')

describe('export: readExportBundle', () => {
  it('读全量业务数据（地点/记录/媒体/标签/维度/分享/关联）', () => {
    const { db, repo } = setup()
    seed(db, repo)

    const bundle = readExportBundle(db)

    expect(bundle.places.map((p) => p.id)).toEqual(['p1'])
    expect(bundle.entries.map((e) => e.id)).toEqual(['e1'])
    expect(bundle.media.map((m) => m.id)).toEqual(['m1'])
    expect(bundle.tags.map((t) => t.name)).toEqual(['安静'])
    expect(bundle.tagDimensions.map((d) => d.kind)).toEqual(['scene'])
    expect(bundle.shares.map((s) => s.slug)).toEqual(['abcdefghijklmnopqrstuv'])
    expect(bundle.entryTags).toEqual([{ entry_id: 'e1', tag_id: 't1' }])
  })

  it('空库也能读出空数组（不抛错）', () => {
    const { db } = setup()
    const bundle = readExportBundle(db)
    expect(bundle.places).toEqual([])
    expect(bundle.entries).toEqual([])
  })
})

describe('export: 文件名', () => {
  it('按日期生成，扩展名随类型', () => {
    expect(exportFilename('json', new Date(2026, 8, 20))).toBe('place-journal-export-2026-09-20.json')
    expect(exportFilename('csv', new Date(2026, 0, 3))).toBe('place-journal-export-2026-01-03.csv')
  })
})

describe('export: JSON 序列化', () => {
  it('含 schema_version / media_manifest，标签名与本地路径回退齐备', () => {
    const { db, repo } = setup()
    seed(db, repo)

    const file = toExportJson(readExportBundle(db), FIXED)

    expect(file.mime).toBe('application/json')
    expect(file.filename).toBe('place-journal-export-2026-09-20.json')
    const payload = JSON.parse(file.content)
    expect(payload.schema_version).toBe(1)
    expect(payload.exported_at).toBe(FIXED.toISOString())
    expect(payload.places[0].name).toBe('海边咖啡')
    expect(payload.entries[0].visit_date).toBe('2026-09-18')
    // 关联表带标签名，便于离线阅读。
    expect(payload.entry_tags).toEqual([{ entry_id: 'e1', tag_id: 't1', tag_name: '安静' }])
    // storage_path 优先远端，缺失回退本地，再回退占位。
    expect(payload.media_manifest[0]).toMatchObject({
      id: 'm1',
      order: 0,
      storage_path: 'exports/m1.jpg',
      local_thumb_path: null,
    })
  })
})

describe('export: CSV 序列化', () => {
  it('表头逐列对齐 Web；标签用 | 连接并带 BOM', () => {
    const { db, repo } = setup()
    seed(db, repo)

    const file = toExportCsv(readExportBundle(db), FIXED)

    expect(file.mime).toBe('text/csv')
    expect(file.filename).toBe('place-journal-export-2026-09-20.csv')
    expect(file.content.startsWith('\ufeff')).toBe(true)
    const lines = file.content.slice(1).split('\n')
    expect(lines[0]).toBe('日期,地点,区域,评分,人均,摘要,公开理由,标签,同步状态')
    expect(lines[1]).toBe('"2026-09-18","海边咖啡","海口 · 西海岸","5","45","海边的落日","适合约会","安静","local"')
  })

  it('引号与逗号按 RFC4180 转义', () => {
    const { db, repo } = setup()
    seed(db, repo)
    db.runSync("UPDATE entries SET summary = '他说\"太棒了\", 真的' WHERE id = 'e1'")

    const file = toExportCsv(readExportBundle(db), FIXED)

    expect(file.content).toContain('"他说""太棒了"", 真的"')
  })

  it('记录按到访日期升序排列', () => {
    const { db, repo } = setup()
    seed(db, repo)
    repo.saveCoreEntity('entries', {
      id: 'e0',
      place_id: 'p1',
      visit_date: '2026-09-01',
      is_private: 0,
      demo: 0,
      created_at: '2026-09-01T00:00:00.000Z',
    })

    const lines = toExportCsv(readExportBundle(db), FIXED).content.slice(1).split('\n')
    expect(lines[1]).toContain('"2026-09-01"')
    expect(lines[2]).toContain('"2026-09-18"')
  })
})
