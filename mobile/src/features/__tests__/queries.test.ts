import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import {
  countDistinctPlaces,
  countEntriesForPlace,
  filterGalleryEntries,
  getEntryDetail,
  getPlaceDetail,
  listGalleryEntries,
  listPlaceOptions,
  listTagsGrouped,
  localCounts,
  mediaUri,
  ratingTierCounts,
  searchGalleryEntries,
  tagUsageWithChildren,
  type GalleryEntry,
  type MediaDetail,
  type TagGroup,
  type TagWithUsage,
} from '../queries'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, repo: createRepository(db) }
}

function seedPlace(repo: Repository, id: string, name: string, area?: string): void {
  repo.saveCoreEntity('places', {
    id,
    name,
    area: area ?? null,
    coord_precision: 'exact',
    is_private: 0,
    demo: 0,
    created_at: '2026-09-01T00:00:00.000Z',
  })
}

function seedEntry(
  repo: Repository,
  id: string,
  placeId: string,
  visitDate: string,
  extra: Record<string, unknown> = {},
): void {
  repo.saveCoreEntity('entries', {
    id,
    place_id: placeId,
    visit_date: visitDate,
    is_private: 0,
    demo: 0,
    created_at: `${visitDate}T00:00:00.000Z`,
    ...extra,
  })
}

function seedMedia(repo: Repository, id: string, entryId: string, placeId: string, order: number): void {
  repo.upsert('media', {
    id,
    entry_id: entryId,
    place_id: placeId,
    local_thumb_path: `file:///documents/${id}/thumb.jpg`,
    local_display_path: `file:///documents/${id}/display.jpg`,
    sort_order: order,
    sync_status: 'local',
    created_at: '2026-09-18T00:00:00.000Z',
  })
}

describe('queries: 画廊记录流', () => {
  it('按到访日期倒序；封面取 cover_media_id；带媒体数与标签', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '海边咖啡', '海口')
    seedEntry(repo, 'e-old', 'p1', '2026-09-10', { rating: 4, note_private: '旧感受' })
    seedEntry(repo, 'e-new', 'p1', '2026-09-18', { rating: 5, cover_media_id: 'm2' })
    seedMedia(repo, 'm1', 'e-new', 'p1', 0)
    seedMedia(repo, 'm2', 'e-new', 'p1', 1)
    repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })
    repo.saveCoreEntity('tags', { id: 't1', dimension_id: 'd1', name: '安静', sort_order: 0 })
    db.runSync("INSERT INTO entry_tags (entry_id, tag_id) VALUES ('e-new', 't1')")

    const entries = listGalleryEntries(db)

    expect(entries.map((e) => e.id)).toEqual(['e-new', 'e-old'])
    expect(entries[0]).toMatchObject({
      placeName: '海边咖啡',
      placeArea: '海口',
      rating: 5,
      mediaCount: 2,
      coverThumbPath: 'file:///documents/m2/thumb.jpg',
      tagIds: ['t1'],
    })
    expect(entries[1].coverThumbPath).toBeUndefined()
  })

  it('getEntryDetail 返回按顺序的媒体链，find 不存在返回 null', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '地点')
    seedEntry(repo, 'e1', 'p1', '2026-09-18')
    seedMedia(repo, 'm2', 'e1', 'p1', 1)
    seedMedia(repo, 'm1', 'e1', 'p1', 0)

    const detail = getEntryDetail(db, 'e1')
    expect(detail?.media.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(getEntryDetail(db, 'missing')).toBeNull()
  })

  it('cover_thumb_path 三态：指定封面优先／无封面回退首张／无媒体为空', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '地点')
    seedEntry(repo, 'e-cover', 'p1', '2026-09-18', { cover_media_id: 'm2' })
    seedMedia(repo, 'm1', 'e-cover', 'p1', 0)
    seedMedia(repo, 'm2', 'e-cover', 'p1', 1)
    seedEntry(repo, 'e-fallback', 'p1', '2026-09-17')
    seedMedia(repo, 'm4', 'e-fallback', 'p1', 1)
    seedMedia(repo, 'm3', 'e-fallback', 'p1', 0)
    seedEntry(repo, 'e-empty', 'p1', '2026-09-16')

    const byId = new Map(listGalleryEntries(db).map((e) => [e.id, e]))
    expect(byId.get('e-cover')?.coverThumbPath).toBe('file:///documents/m2/thumb.jpg')
    expect(byId.get('e-fallback')?.coverThumbPath).toBe('file:///documents/m3/thumb.jpg')
    expect(byId.get('e-empty')?.coverThumbPath).toBeUndefined()
  })
})

describe('queries: 地点时间线', () => {
  it('统计到访次数与最高评分，按到访日期倒序', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '公园', '城东')
    seedEntry(repo, 'e1', 'p1', '2026-09-01', { rating: 3 })
    seedEntry(repo, 'e2', 'p1', '2026-09-18', { rating: 5 })

    const detail = getPlaceDetail(db, 'p1')

    expect(detail).toMatchObject({ name: '公园', visitCount: 2, bestRating: 5, lastVisitDate: '2026-09-18' })
    expect(detail?.entries.map((e) => e.id)).toEqual(['e2', 'e1'])
    expect(getPlaceDetail(db, 'missing')).toBeNull()
    expect(listPlaceOptions(db)).toEqual([{ id: 'p1', name: '公园', area: '城东' }])
  })
})

describe('queries: 标签维度分组', () => {
  it('按维度归组并统计使用次数', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '地点')
    seedEntry(repo, 'e1', 'p1', '2026-09-18')
    repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })
    repo.saveCoreEntity('tag_dimensions', { id: 'd2', name: '人群', kind: 'crowd', sort_order: 1 })
    repo.saveCoreEntity('tags', { id: 't1', dimension_id: 'd1', name: '安静', sort_order: 0 })
    repo.saveCoreEntity('tags', { id: 't2', dimension_id: 'd1', name: '热闹', sort_order: 1 })
    db.runSync("INSERT INTO entry_tags (entry_id, tag_id) VALUES ('e1', 't1')")

    const groups = listTagsGrouped(db)

    expect(groups.map((g) => g.dimension.name)).toEqual(['场景', '人群'])
    expect(groups[0].tags.map((t) => [t.name, t.usage])).toEqual([['安静', 1], ['热闹', 0]])
    expect(groups[1].tags).toHaveLength(0)
  })
})

describe('queries: 过滤与计数', () => {
  const entries: GalleryEntry[] = [
    {
      id: 'e1',
      placeId: 'p1',
      placeName: '海边咖啡',
      placeArea: '海口',
      visitDate: '2026-09-18',
      rating: 5,
      mediaCount: 0,
      isPrivate: false,
      revision: 1,
      baseRevision: null,
      demo: false,
      syncStatus: 'local',
      createdAt: '',
      updatedAt: '',
      tagIds: ['t1', 't2'],
      notePrivate: '晚上很安静',
    },
    {
      id: 'e2',
      placeId: 'p2',
      placeName: '市集',
      visitDate: '2026-09-10',
      rating: 2,
      mediaCount: 0,
      isPrivate: false,
      revision: 1,
      baseRevision: null,
      demo: false,
      syncStatus: 'local',
      createdAt: '',
      updatedAt: '',
      tagIds: ['t2'],
    },
  ]

  it('文字命中地点/感受；标签取交集；评分下限', () => {
    expect(filterGalleryEntries(entries, { text: '海口' }).map((e) => e.id)).toEqual(['e1'])
    expect(filterGalleryEntries(entries, { text: '安静' }).map((e) => e.id)).toEqual(['e1'])
    expect(filterGalleryEntries(entries, { tagIds: ['t1', 't2'] }).map((e) => e.id)).toEqual(['e1'])
    expect(filterGalleryEntries(entries, { tagIds: ['t2'] }).map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(filterGalleryEntries(entries, { minRating: 4 }).map((e) => e.id)).toEqual(['e1'])
    expect(filterGalleryEntries(entries, { text: '不存在' })).toHaveLength(0)
  })

  it('ratingTierCounts 按「N 星以上」动态计数', () => {
    expect(ratingTierCounts(entries)).toEqual({ 1: 2, 2: 2, 3: 1, 4: 1, 5: 1 })
    expect(ratingTierCounts([])).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('countDistinctPlaces 按地点去重（量词与 Web 一致）', () => {
    expect(countDistinctPlaces(entries)).toBe(2)
    // 同一地点的多条记录只算一个私藏地点。
    expect(countDistinctPlaces([entries[0], { ...entries[0], id: 'e3', visitDate: '2026-09-01' }])).toBe(1)
    expect(countDistinctPlaces([])).toBe(0)
  })

  it('tagUsageWithChildren 父标签聚合父+子，子标签只算自身', () => {
    const groups: TagGroup[] = [
      {
        dimension: { id: 'd1', name: '场景', kind: 'scene', sortOrder: 0 },
        tags: [
          { id: 'p1', dimensionId: 'd1', parentId: null, name: '户外', sortOrder: 0, usage: 3 },
          { id: 'c1', dimensionId: 'd1', parentId: 'p1', name: '海边', sortOrder: 1, usage: 4 },
          { id: 'c2', dimensionId: 'd1', parentId: 'p1', name: '山上', sortOrder: 2, usage: 1 },
          { id: 'p2', dimensionId: 'd1', parentId: null, name: '室内', sortOrder: 3, usage: 2 },
        ],
      },
    ]
    const tags = groups[0].tags
    const byId = (id: string): TagWithUsage => tags.find((t) => t.id === id)!

    expect(tagUsageWithChildren(tags, byId('p1'))).toBe(8) // 父 3 + 子 4 + 子 1
    expect(tagUsageWithChildren(tags, byId('p2'))).toBe(2) // 无子标签，等于自身
    expect(tagUsageWithChildren(tags, byId('c1'))).toBe(4) // 子标签只算自身
  })

  it('searchGalleryEntries 组合 DB 与过滤；localCounts 正确', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '海边咖啡', '海口')
    seedEntry(repo, 'e1', 'p1', '2026-09-18', { rating: 5 })
    seedMedia(repo, 'm1', 'e1', 'p1', 0)

    expect(searchGalleryEntries(db, { text: '海口' }).map((e) => e.id)).toEqual(['e1'])
    expect(localCounts(db)).toEqual({ places: 1, entries: 1, media: 1, tags: 0 })
  })
})

describe('queries: 详情页辅助（改名提示 / 灯箱取图）', () => {
  it('countEntriesForPlace 只数本地点；未知地点为 0', () => {
    const { db, repo } = setup()
    seedPlace(repo, 'p1', '地点一')
    seedPlace(repo, 'p2', '地点二')
    seedEntry(repo, 'e1', 'p1', '2026-09-10')
    seedEntry(repo, 'e2', 'p1', '2026-09-18')
    seedEntry(repo, 'e3', 'p2', '2026-09-18')

    expect(countEntriesForPlace(db, 'p1')).toBe(2)
    expect(countEntriesForPlace(db, 'p2')).toBe(1)
    expect(countEntriesForPlace(db, 'missing')).toBe(0)
  })

  it('mediaUri：缩略图优先 thumb、大图优先 display；本地缺失回退演示图，全无则空串', () => {
    const full: MediaDetail = {
      id: 'm1',
      entryId: 'e1',
      placeId: 'p1',
      localDisplayPath: 'file:///display.jpg',
      localThumbPath: 'file:///thumb.jpg',
      order: 0,
      syncStatus: 'local',
    }
    expect(mediaUri(full)).toBe('file:///thumb.jpg')
    expect(mediaUri(full, 'display')).toBe('file:///display.jpg')

    const demo: MediaDetail = { ...full, localDisplayPath: undefined, localThumbPath: undefined, demoUri: 'https://picsum.photos/1' }
    expect(mediaUri(demo)).toBe('https://picsum.photos/1')
    expect(mediaUri(demo, 'display')).toBe('https://picsum.photos/1')

    const onlyDisplay: MediaDetail = { ...full, localThumbPath: undefined }
    expect(mediaUri(onlyDisplay)).toBe('file:///display.jpg')

    const empty: MediaDetail = { ...full, localDisplayPath: undefined, localThumbPath: undefined }
    expect(mediaUri(empty)).toBe('')
  })
})
