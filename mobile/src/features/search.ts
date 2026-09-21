// 找地点：自然语言 → 确定性筛选条件（本地启发式，离线可用）。
//
// 对标 Web `src/lib/search.ts`（`parseQueryWithKinds` / `matchEntries` / `expandTagIds`）：
// 解析口径与筛选语义逐条对齐，数据源换成移动端只读查询层的 `GalleryEntry`。
// 本文件不 import Expo，纯函数便于单测。

import {
  expandTagIds,
  groupEntriesByPlace,
  type GalleryEntry,
  type TagGroup,
  type TagWithUsage,
} from './queries'

export interface Filters {
  areaTagIds: string[]
  typeTagIds: string[]
  sceneTagIds: string[]
  crowdTagIds: string[]
  maxBudget?: number
  minRating?: number
  text?: string
}

/** 命中结果按地点聚合（对标 Web `Hit`：`best` = 该地点最近一次到访记录）。 */
export interface Hit {
  placeId: string
  placeName: string
  placeArea?: string
  entries: GalleryEntry[]
  best: GalleryEntry
}

const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 中文/全角数字 → number（与 Web `cnToNumber` 同口径，支持 十/百 组合）。 */
export function cnToNumber(input: string): number | undefined {
  const t = input.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248))
  if (/^\d+$/.test(t)) return Number(t)
  if (t.includes('百')) {
    const [h, rest] = t.split('百')
    const hundreds = (CN_DIGIT[h] ?? 0) * 100
    return hundreds + (rest ? cnToNumber(rest) ?? 0 : 0)
  }
  if (t.includes('十')) {
    const [tens, ones] = t.split('十')
    return (tens ? CN_DIGIT[tens] ?? 1 : 1) * 10 + (ones ? CN_DIGIT[ones] ?? 0 : 0)
  }
  if (t.length === 1 && CN_DIGIT[t] != null) return CN_DIGIT[t]
  return undefined
}

const TOKEN_SPLIT = /[，,、。\s？?]+/

/** 分组标签 → 扁平标签 + kindOf（Find 页把 `listTagsGrouped` 结果喂给解析/筛选用）。 */
export function flattenTags(groups: TagGroup[]): {
  tags: TagWithUsage[]
  kindOf: (tag: TagWithUsage) => string
} {
  const kindByDimension = new Map(groups.map((g) => [g.dimension.id, g.dimension.kind]))
  return {
    tags: groups.flatMap((g) => g.tags),
    kindOf: (tag) => kindByDimension.get(tag.dimensionId) ?? 'custom',
  }
}

/**
 * 自然语言解析：预算 / 星级 / 标签名匹配；命中父标签由后续筛选自动包含子标签。
 * `kindOf` 决定标签落进哪个桶（region/type/scene/crowd），其余 kind 不参与结构化筛选。
 */
export function parseQuery(
  q: string,
  tags: TagWithUsage[],
  kindOf: (tag: TagWithUsage) => string,
): Filters {
  const f: Filters = { areaTagIds: [], typeTagIds: [], sceneTagIds: [], crowdTagIds: [], text: q.trim() || undefined }
  if (!q.trim()) return f
  const n = (s: string) => cnToNumber(s) ?? NaN

  const budget = q.match(/(?:人均|预算|花费|消费)(?:不超过|以内|之内|低于)?\s*([0-9０-９一二三四五六七八九十百]+)/)
  const budget2 = q.match(/([0-9０-９一二三四五六七八九十百]+)\s*(?:以内|以下)/)
  if (budget) f.maxBudget = n(budget[1])
  else if (budget2) f.maxBudget = n(budget2[1])

  const star = q.match(/([0-9０-９一二三四五六七八九])\s*星(?:以上|及以上)?/)
  if (star && !Number.isNaN(n(star[1]))) f.minRating = n(star[1])

  const tokens = q.split(TOKEN_SPLIT).filter((w) => w.length >= 2)
  const tagMatched = (t: TagWithUsage) => q.includes(t.name) || tokens.some((w) => t.name.includes(w) || w.includes(t.name))
  for (const t of tags) {
    if (t.name.length < 2 || !tagMatched(t)) continue
    const kind = kindOf(t)
    const bucket =
      kind === 'region' ? f.areaTagIds
      : kind === 'type' ? f.typeTagIds
      : kind === 'scene' ? f.sceneTagIds
      : kind === 'crowd' ? f.crowdTagIds
      : null
    bucket?.push(t.id)
  }
  return f
}

/**
 * 按条件筛记录并按地点聚合：
 *   - 结构化条件（标签桶/预算/星级）逐条过滤记录；
 *   - 无法解析出结构化条件时，退回全文包含匹配（地点名/区域/摘要/感受/标签名）；
 *   - 只有还剩记录的地点进入结果，按最近到访倒序。
 */
export function matchEntries(
  filters: Filters,
  entries: GalleryEntry[],
  tags: TagWithUsage[],
): Hit[] {
  const area = expandTagIds(filters.areaTagIds, tags)
  const type = expandTagIds(filters.typeTagIds, tags)
  const scene = expandTagIds(filters.sceneTagIds, tags)
  const crowd = expandTagIds(filters.crowdTagIds, tags)

  const structural = !!(
    area.length || type.length || scene.length || crowd.length ||
    filters.maxBudget != null || filters.minRating != null
  )
  const tokens = (filters.text ?? '').split(TOKEN_SPLIT).filter((w) => w.length >= 2)
  const nameOf = (id: string) => tags.find((t) => t.id === id)?.name ?? ''

  const hits: Hit[] = []
  for (const group of groupEntriesByPlace(entries)) {
    const pes = group.entries

    // 文本兜底：仅在无法解析出结构化条件时，直接做文本包含匹配。
    if (!structural && tokens.length) {
      const hay = pes
        .map((e) =>
          [
            e.summary,
            e.notePublic,
            e.notePrivate,
            e.transcript,
            e.placeName,
            e.placeArea,
            e.tagIds.map(nameOf).join(' '),
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ')
      const hit = tokens.some((w) => hay.includes(w))
      if (!hit) continue
    }

    const matched = pes.filter((e) => {
      if (filters.maxBudget != null && (e.budget ?? 0) > filters.maxBudget) return false
      if (filters.minRating != null && (e.rating ?? 0) < filters.minRating) return false
      const ids = new Set(e.tagIds)
      if (area.length && !area.some((id) => ids.has(id))) return false
      if (type.length && !type.some((id) => ids.has(id))) return false
      if (scene.length && !scene.some((id) => ids.has(id))) return false
      if (crowd.length && !crowd.some((id) => ids.has(id))) return false
      return true
    })
    if (matched.length) {
      hits.push({
        placeId: group.placeId,
        placeName: group.placeName,
        placeArea: group.placeArea,
        entries: matched,
        best: matched[0],
      })
    }
  }
  return hits.sort((a, b) => b.best.visitDate.localeCompare(a.best.visitDate))
}
