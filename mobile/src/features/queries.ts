// 本地只读查询层（TASK-DEV-09，界面全部数据来源）。
//
// 只读 SQLite（经 `SqlDatabase` 抽象），不接网络；由各页面调用后直接渲染。
// 过滤/排序的纯逻辑（`filterGalleryEntries`）独立导出，便于单测；本文件不 import Expo。

import type { SqlDatabase } from '../db/database'

export interface GalleryEntry {
  id: string
  placeId: string
  placeName: string
  placeArea?: string
  visitDate: string
  rating?: number
  budget?: number
  transcript?: string
  notePrivate?: string
  notePublic?: string
  summary?: string
  coverMediaId?: string
  coverThumbPath?: string
  mediaCount: number
  isPrivate: boolean
  revision: number
  baseRevision: number | null
  demo: boolean
  syncStatus: string
  syncError?: string
  createdAt: string
  updatedAt: string
  tagIds: string[]
}

export interface MediaDetail {
  id: string
  entryId: string
  placeId: string
  localDisplayPath?: string
  localThumbPath?: string
  /** 演示数据的远端图 URL（picsum）；本地路径缺失时的回退来源。 */
  demoUri?: string
  remotePath?: string
  remoteThumbPath?: string
  order: number
  syncStatus: string
}

export interface EntryDetail {
  entry: GalleryEntry
  media: MediaDetail[]
}

export interface PlaceOption {
  id: string
  name: string
  area?: string
}

export interface PlaceDetail {
  id: string
  name: string
  area?: string
  visitCount: number
  bestRating?: number
  lastVisitDate?: string
  entries: GalleryEntry[]
}

export interface TagWithUsage {
  id: string
  dimensionId: string
  parentId: string | null
  name: string
  alias?: string
  sortOrder: number
  usage: number
}

export interface TagGroup {
  dimension: { id: string; name: string; kind: string; sortOrder: number }
  tags: TagWithUsage[]
}

export interface SearchFilters {
  text?: string
  tagIds?: string[]
  minRating?: number | null
}

interface EntrySqlRow {
  id: string
  place_id: string
  place_name: string
  place_area: string | null
  visit_date: string
  rating: number | null
  budget: number | null
  transcript: string | null
  note_private: string | null
  note_public: string | null
  summary: string | null
  cover_media_id: string | null
  cover_thumb_path: string | null
  media_count: number
  is_private: number
  revision: number
  base_revision: number | null
  demo: number
  sync_status: string
  sync_error: string | null
  created_at: string | null
  updated_at: string | null
}

interface MediaSqlRow {
  id: string
  entry_id: string
  place_id: string
  local_display_path: string | null
  local_thumb_path: string | null
  demo_uri: string | null
  remote_path: string | null
  remote_thumb_path: string | null
  sort_order: number
  sync_status: string
}

const ENTRY_SELECT = `
SELECT
  e.id, e.place_id, p.name AS place_name, p.area AS place_area,
  e.visit_date, e.rating, e.budget, e.transcript, e.note_private, e.note_public, e.summary,
  e.cover_media_id, e.is_private, e.revision, e.base_revision, e.demo, e.sync_status, e.sync_error,
  e.created_at, e.updated_at,
  -- 封面图 URI：优先本地缩略图，演示数据回退 demo_uri（picsum 远端图，本字段可能不是本地路径）。
  COALESCE(
    (SELECT COALESCE(m.local_thumb_path, m.demo_uri) FROM media m WHERE m.entry_id = e.id AND m.id = e.cover_media_id LIMIT 1),
    (SELECT COALESCE(m.local_thumb_path, m.demo_uri) FROM media m WHERE m.entry_id = e.id ORDER BY m.sort_order ASC, m.created_at ASC LIMIT 1)
  ) AS cover_thumb_path,
  (SELECT COUNT(*) FROM media m WHERE m.entry_id = e.id) AS media_count
FROM entries e
JOIN places p ON p.id = e.place_id`

function opt(value: string | null | undefined): string | undefined {
  return value == null || value === '' ? undefined : value
}

function num(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value
}

/** 一次性取全表 entry_tags，避免 N+1。 */
function tagIdsByEntry(db: SqlDatabase): Map<string, string[]> {
  const rows = db.getAllSync<{ entry_id: string; tag_id: string }>(
    'SELECT entry_id, tag_id FROM entry_tags ORDER BY rowid ASC',
  )
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.entry_id)
    if (list) list.push(row.tag_id)
    else map.set(row.entry_id, [row.tag_id])
  }
  return map
}

function mapEntry(row: EntrySqlRow, tags: Map<string, string[]>): GalleryEntry {
  return {
    id: row.id,
    placeId: row.place_id,
    placeName: row.place_name,
    placeArea: opt(row.place_area),
    visitDate: row.visit_date,
    rating: num(row.rating),
    budget: num(row.budget),
    transcript: opt(row.transcript),
    notePrivate: opt(row.note_private),
    notePublic: opt(row.note_public),
    summary: opt(row.summary),
    coverMediaId: opt(row.cover_media_id),
    coverThumbPath: opt(row.cover_thumb_path),
    mediaCount: row.media_count ?? 0,
    isPrivate: row.is_private === 1,
    revision: row.revision,
    baseRevision: row.base_revision,
    demo: row.demo === 1,
    syncStatus: row.sync_status,
    syncError: opt(row.sync_error),
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    tagIds: tags.get(row.id) ?? [],
  }
}

/** 全部记录：按到访日期倒序（同日按创建时间倒序）。 */
export function listGalleryEntries(db: SqlDatabase): GalleryEntry[] {
  const rows = db.getAllSync<EntrySqlRow>(
    `${ENTRY_SELECT}
     ORDER BY e.visit_date DESC, (e.created_at IS NULL) ASC, e.created_at DESC, e.id DESC`,
  )
  const tags = tagIdsByEntry(db)
  return rows.map((row) => mapEntry(row, tags))
}

/** 单条记录详情（含媒体链）。不存在返回 null。 */
export function getEntryDetail(db: SqlDatabase, entryId: string): EntryDetail | null {
  const row = db.getFirstSync<EntrySqlRow>(`${ENTRY_SELECT} WHERE e.id = ?`, entryId)
  if (!row) return null
  const media = db
    .getAllSync<MediaSqlRow>(
      'SELECT * FROM media WHERE entry_id = ? ORDER BY sort_order ASC, created_at ASC',
      entryId,
    )
    .map((m) => ({
      id: m.id,
      entryId: m.entry_id,
      placeId: m.place_id,
      localDisplayPath: opt(m.local_display_path),
      localThumbPath: opt(m.local_thumb_path),
      demoUri: opt(m.demo_uri),
      remotePath: opt(m.remote_path),
      remoteThumbPath: opt(m.remote_thumb_path),
      order: m.sort_order,
      syncStatus: m.sync_status,
    }))
  return { entry: mapEntry(row, tagIdsByEntry(db)), media }
}

/** 地点详情 + 到访时间线。不存在返回 null。 */
export function getPlaceDetail(db: SqlDatabase, placeId: string): PlaceDetail | null {
  const place = db.getFirstSync<{ id: string; name: string; area: string | null }>(
    'SELECT id, name, area FROM places WHERE id = ?',
    placeId,
  )
  if (!place) return null
  const entries = listGalleryEntries(db).filter((e) => e.placeId === placeId)
  const ratings = entries.map((e) => e.rating).filter((r): r is number => typeof r === 'number')
  return {
    id: place.id,
    name: place.name,
    area: opt(place.area),
    visitCount: entries.length,
    bestRating: ratings.length > 0 ? Math.max(...ratings) : undefined,
    lastVisitDate: entries[0]?.visitDate,
    entries,
  }
}

/** 地点下拉候选（新建记录时选择）。 */
export function listPlaceOptions(db: SqlDatabase): PlaceOption[] {
  return db
    .getAllSync<{ id: string; name: string; area: string | null }>(
      'SELECT id, name, area FROM places ORDER BY updated_at DESC, name ASC',
    )
    .map((p) => ({ id: p.id, name: p.name, area: opt(p.area) }))
}

/** 标签维度 + 标签（含被记录引用次数），供 Tags / Record / Find 复用。 */
export function listTagsGrouped(db: SqlDatabase): TagGroup[] {
  const dimensions = db.getAllSync<{ id: string; name: string; kind: string; sort_order: number }>(
    'SELECT id, name, kind, sort_order FROM tag_dimensions ORDER BY sort_order ASC, name ASC',
  )
  const tags = db.getAllSync<{
    id: string
    dimension_id: string
    parent_id: string | null
    name: string
    alias: string | null
    sort_order: number
  }>('SELECT id, dimension_id, parent_id, name, alias, sort_order FROM tags ORDER BY sort_order ASC, name ASC')

  const usage = new Map<string, number>()
  for (const row of db.getAllSync<{ tag_id: string }>('SELECT tag_id FROM entry_tags')) {
    usage.set(row.tag_id, (usage.get(row.tag_id) ?? 0) + 1)
  }

  const groups: TagGroup[] = dimensions.map((d) => ({
    dimension: { id: d.id, name: d.name, kind: d.kind, sortOrder: d.sort_order },
    tags: tags
      .filter((t) => t.dimension_id === d.id)
      .map((t) => ({
        id: t.id,
        dimensionId: t.dimension_id,
        parentId: t.parent_id,
        name: t.name,
        alias: opt(t.alias),
        sortOrder: t.sort_order,
        usage: usage.get(t.id) ?? 0,
      })),
  }))
  return groups
}

/**
 * 纯过滤（不碰 DB，便于单测）：
 * 文字命中 地点名/区域/摘要/私密感受/公开理由；标签须全部命中（交集）；评分下限。
 */
export function filterGalleryEntries(entries: GalleryEntry[], filters: SearchFilters): GalleryEntry[] {
  const text = (filters.text ?? '').trim().toLowerCase()
  const picked = filters.tagIds ?? []
  const minRating = filters.minRating ?? null
  return entries.filter((entry) => {
    if (text.length > 0) {
      const haystack = [
        entry.placeName,
        entry.placeArea,
        entry.summary,
        entry.notePrivate,
        entry.notePublic,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(text)) return false
    }
    if (picked.length > 0 && !picked.every((id) => entry.tagIds.includes(id))) return false
    if (minRating != null && (entry.rating ?? 0) < minRating) return false
    return true
  })
}

/**
 * 评分档动态计数：`counts[n]` = 评分 ≥ n 的记录数（与 Find「N 星以上」筛选同口径）。
 * 纯函数，供 Find 页在 chips 上展示每档命中数。
 */
export function ratingTierCounts(entries: GalleryEntry[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const entry of entries) {
    const rating = entry.rating ?? 0
    for (let n = 1; n <= 5; n++) if (rating >= n) counts[n] += 1
  }
  return counts
}

/** 本地搜索（DB + 纯过滤组合，供 Find 页直接调用）。 */
export function searchGalleryEntries(db: SqlDatabase, filters: SearchFilters): GalleryEntry[] {
  return filterGalleryEntries(listGalleryEntries(db), filters)
}

/** 数据量摘要（Mine 页展示）。 */
export function localCounts(db: SqlDatabase): { places: number; entries: number; media: number; tags: number } {
  return {
    places: db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM places')?.n ?? 0,
    entries: db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n ?? 0,
    media: db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM media')?.n ?? 0,
    tags: db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM tags')?.n ?? 0,
  }
}
