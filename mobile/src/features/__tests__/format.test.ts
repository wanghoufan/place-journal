import {
  formatDateTime,
  formatVisitDate,
  parseOptionalBudget,
  parseOptionalInt,
  relativeDayChip,
  starsText,
  syncLabel,
  syncTone,
  todayIso,
  truncate,
} from '../format'
import { leafTags, sortTagsByUsage, toggleTagId, validateRecordForm } from '../form'
import type { TagGroup } from '../queries'

describe('format: 日期与状态', () => {
  it('todayIso 补零；formatVisitDate 点分隔', () => {
    expect(todayIso(new Date(2026, 8, 5))).toBe('2026-09-05')
    expect(formatVisitDate('2026-09-18')).toBe('2026 . 09 . 18')
  })

  it('relativeDayChip 覆盖今天/昨天/天/周/月', () => {
    const now = new Date(2026, 8, 18)
    expect(relativeDayChip('2026-09-18', now)).toBe('今天')
    expect(relativeDayChip('2026-09-17', now)).toBe('昨天')
    expect(relativeDayChip('2026-09-14', now)).toBe('4 天前')
    expect(relativeDayChip('2026-09-01', now)).toBe('2 周前')
    expect(relativeDayChip('2026-07-04', now)).toBe('7 月 4 日')
  })

  it('formatDateTime 容错空值与非法值', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
    expect(formatDateTime('2026-09-18T01:02:00.000Z')).toMatch(/^2026-09-18 \d{2}:\d{2}$/)
  })

  it('syncLabel / syncTone 口径', () => {
    expect(syncLabel('local')).toBe('仅本机')
    expect(syncLabel('synced')).toBe('已同步')
    expect(syncLabel('conflict')).toBe('冲突待裁决')
    expect(syncTone('synced')).toBe('ok')
    expect(syncTone('failed')).toBe('warn')
    expect(syncTone('local')).toBe('muted')
  })

  it('starsText 与 truncate', () => {
    expect(starsText(undefined)).toBe('未评分')
    expect(starsText(4)).toBe('★★★★☆')
    expect(truncate('abcdef', 3)).toBe('abc…')
    expect(truncate(undefined)).toBe('')
  })
})

describe('format: 数字解析', () => {
  it('parseOptionalInt 限界取整；parseOptionalBudget 允许 0', () => {
    expect(parseOptionalInt('')).toBeUndefined()
    expect(parseOptionalInt('4.6')).toBe(5)
    expect(parseOptionalInt('0', 1, 5)).toBe(1)
    expect(parseOptionalInt('99', 1, 5)).toBe(5)
    expect(parseOptionalBudget('0')).toBe(0)
    expect(parseOptionalBudget('abc')).toBeUndefined()
  })
})

describe('form: 校验与标签', () => {
  it('validateRecordForm 需要地点与日期', () => {
    expect(validateRecordForm({ visitDate: '2026-09-18', tagIds: [] })).toBe('请选择或填写地点')
    expect(validateRecordForm({ newPlaceName: '地点', visitDate: '', tagIds: [] })).toBe('请选择到访日期')
    expect(validateRecordForm({ placeId: 'p1', visitDate: '2026-09-18', tagIds: [] })).toBeNull()
  })

  it('toggleTagId 增删；leafTags 只留叶子', () => {
    expect(toggleTagId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleTagId(['a', 'b'], 'a')).toEqual(['b'])

    const groups: TagGroup[] = [
      {
        dimension: { id: 'd1', name: '场景', kind: 'scene', sortOrder: 0 },
        tags: [
          { id: 'parent', dimensionId: 'd1', parentId: null, name: '户外', sortOrder: 0, usage: 0 },
          { id: 'child', dimensionId: 'd1', parentId: 'parent', name: '海边', sortOrder: 1, usage: 2 },
        ],
      },
    ]
    expect(leafTags(groups).map((t) => t.id)).toEqual(['child'])
    expect(sortTagsByUsage(groups[0].tags).map((t) => t.id)).toEqual(['child', 'parent'])
  })
})
