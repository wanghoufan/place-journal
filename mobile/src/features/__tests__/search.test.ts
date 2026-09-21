// 找地点解析/匹配纯函数（对标 Web `src/lib/search.ts`）：
// 中文数字、预算/星级/标签名解析、按地点聚合命中、文本兜底。

import { cnToNumber, flattenTags, matchEntries, parseQuery, type Filters } from '../search'
import type { GalleryEntry, TagGroup, TagWithUsage } from '../queries'

const KIND: Record<string, string> = {
  'd-region': 'region',
  'd-type': 'type',
  'd-scene': 'scene',
  'd-crowd': 'crowd',
  'd-custom': 'custom',
}
const kindOf = (t: TagWithUsage): string => KIND[t.dimensionId] ?? 'custom'

function tag(over: Partial<TagWithUsage> & { id: string; dimensionId: string; name: string }): TagWithUsage {
  return { parentId: null, sortOrder: 0, usage: 0, ...over }
}

function entry(over: Partial<GalleryEntry> & { id: string }): GalleryEntry {
  return {
    placeId: 'p1',
    placeName: '海边咖啡',
    visitDate: '2026-09-18',
    mediaCount: 0,
    isPrivate: false,
    revision: 1,
    baseRevision: null,
    demo: false,
    syncStatus: 'local',
    createdAt: '',
    updatedAt: '',
    tagIds: [],
    ...over,
  }
}

const TAGS: TagWithUsage[] = [
  tag({ id: 't-haikou', dimensionId: 'd-region', name: '海口' }),
  tag({ id: 't-outdoor', dimensionId: 'd-scene', name: '户外' }),
  tag({ id: 't-seaside', dimensionId: 'd-scene', name: '海边', parentId: 't-outdoor', sortOrder: 1 }),
  tag({ id: 't-coffee', dimensionId: 'd-type', name: '咖啡' }),
  tag({ id: 't-quiet', dimensionId: 'd-custom', name: '安静' }),
]

describe('search: cnToNumber 中文/全角数字', () => {
  it('阿拉伯数字与全角数字', () => {
    expect(cnToNumber('45')).toBe(45)
    expect(cnToNumber('４５')).toBe(45)
  })

  it('中文数字：单字 / 十 / 百 组合', () => {
    expect(cnToNumber('三')).toBe(3)
    expect(cnToNumber('十')).toBe(10)
    expect(cnToNumber('二十')).toBe(20)
    expect(cnToNumber('三十五')).toBe(35)
    expect(cnToNumber('一百二十')).toBe(120)
  })

  it('非数字回落 undefined', () => {
    expect(cnToNumber('咖啡')).toBeUndefined()
    expect(cnToNumber('')).toBeUndefined()
  })
})

describe('search: parseQuery 自然语言解析', () => {
  it('空串 → 全空条件、无文本', () => {
    expect(parseQuery('', TAGS, kindOf)).toEqual<Filters>({
      areaTagIds: [],
      typeTagIds: [],
      sceneTagIds: [],
      crowdTagIds: [],
      text: undefined,
    })
  })

  it('预算：人均 N 以内 / N 以内', () => {
    expect(parseQuery('海口人均50以内的咖啡', TAGS, kindOf).maxBudget).toBe(50)
    expect(parseQuery('预算一百以内', TAGS, kindOf).maxBudget).toBe(100)
    expect(parseQuery('30以内', TAGS, kindOf).maxBudget).toBe(30)
  })

  it('星级：N 星以上', () => {
    expect(parseQuery('4星以上的地方', TAGS, kindOf).minRating).toBe(4)
    expect(parseQuery('三星以上', TAGS, kindOf).minRating).toBe(3)
  })

  it('标签名命中的进对应 kind 桶', () => {
    const f = parseQuery('海口 咖啡 户外', TAGS, kindOf)
    expect(f.areaTagIds).toEqual(['t-haikou'])
    expect(f.typeTagIds).toEqual(['t-coffee'])
    expect(f.sceneTagIds).toEqual(['t-outdoor'])
    expect(f.crowdTagIds).toEqual([])
  })

  it('无法解析的句子保留文本（供兜底匹配）', () => {
    const f = parseQuery('晚上适合聊天的地方', TAGS, kindOf)
    expect(f.text).toBe('晚上适合聊天的地方')
    expect(f.sceneTagIds).toEqual([])
    expect(f.maxBudget).toBeUndefined()
  })
})

describe('search: matchEntries 按地点聚合', () => {
  it('预算与星级逐条过滤，只有还剩记录的地点入选', () => {
    const entries = [
      entry({ id: 'e1', placeId: 'p1', budget: 30, rating: 5 }),
      entry({ id: 'e2', placeId: 'p1', budget: 80, rating: 5 }),
      entry({ id: 'e3', placeId: 'p2', placeName: '贵餐厅', budget: 200, rating: 4 }),
    ]
    const hits = matchEntries({ ...parseQuery('人均50以内', TAGS, kindOf) }, entries, TAGS)
    expect(hits.map((h) => h.placeId)).toEqual(['p1'])
    expect(hits[0].entries.map((e) => e.id)).toEqual(['e1'])

    const starred = matchEntries({ areaTagIds: [], typeTagIds: [], sceneTagIds: [], crowdTagIds: [], minRating: 5 }, entries, TAGS)
    expect(starred.map((h) => h.placeId)).toEqual(['p1'])
  })

  it('父标签自动包含子标签（勾「户外」命中打了「海边」的记录）', () => {
    const entries = [entry({ id: 'e1', tagIds: ['t-seaside'] }), entry({ id: 'e2', placeId: 'p2', tagIds: [] })]
    const hits = matchEntries(
      { areaTagIds: [], typeTagIds: [], sceneTagIds: ['t-outdoor'], crowdTagIds: [] },
      entries,
      TAGS,
    )
    expect(hits.map((h) => h.placeId)).toEqual(['p1'])
  })

  it('无结构化条件时退回文本包含（感受/地点名/标签名）', () => {
    const entries = [
      entry({ id: 'e1', notePrivate: '晚上很安静，适合聊天' }),
      entry({ id: 'e2', placeId: 'p2', placeName: '市集', summary: '热闹' }),
    ]
    expect(matchEntries(parseQuery('安静', TAGS, kindOf), entries, TAGS).map((h) => h.placeId)).toEqual(['p1'])
    expect(matchEntries(parseQuery('市集', TAGS, kindOf), entries, TAGS).map((h) => h.placeId)).toEqual(['p2'])
    expect(matchEntries(parseQuery('不存在的词', TAGS, kindOf), entries, TAGS)).toHaveLength(0)
  })

  it('命中按地点聚合，best 取最近一次到访；组间按最近到访倒序', () => {
    const entries = [
      entry({ id: 'e-old', placeId: 'p1', visitDate: '2026-09-01' }),
      entry({ id: 'e-new', placeId: 'p1', visitDate: '2026-09-20' }),
      entry({ id: 'e-p2', placeId: 'p2', placeName: '市集', visitDate: '2026-09-18' }),
    ]
    const hits = matchEntries({ areaTagIds: [], typeTagIds: [], sceneTagIds: [], crowdTagIds: [] }, entries, TAGS)
    expect(hits.map((h) => h.placeId)).toEqual(['p1', 'p2'])
    expect(hits[0].best.id).toBe('e-new')
    expect(hits[0].entries.map((e) => e.id)).toEqual(['e-new', 'e-old'])
  })
})

describe('search: flattenTags 分组标签扁平化', () => {
  it('扁平列表保留全部标签，kindOf 按维度查 kind', () => {
    const groups: TagGroup[] = [
      { dimension: { id: 'd-scene', name: '场景', kind: 'scene', sortOrder: 0 }, tags: [tag({ id: 's1', dimensionId: 'd-scene', name: '放空' })] },
      { dimension: { id: 'd-type', name: '类型', kind: 'type', sortOrder: 1 }, tags: [tag({ id: 'y1', dimensionId: 'd-type', name: '咖啡' })] },
    ]
    const { tags, kindOf: kind } = flattenTags(groups)
    expect(tags.map((t) => t.id)).toEqual(['s1', 'y1'])
    expect(kind(tags[0])).toBe('scene')
    expect(kind(tags[1])).toBe('type')
    expect(kind(tag({ id: 'x', dimensionId: 'missing', name: '孤儿' }))).toBe('custom')
  })
})
