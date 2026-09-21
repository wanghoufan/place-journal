// 数据自主（对标 Web `src/lib/exporter.ts`）：导出结构化 JSON / CSV + 媒体清单。
//
// 本文件只做「读库 + 纯序列化」，不 import Expo、不碰文件系统与分享 UI：
// 真机落盘/分享见 `exportFile.ts`（本文件因此可在 node 单测里直接跑）。
//   - JSON：exported_at / schema_version / places / entries / tags / tag_dimensions /
//     shares / entry_tags / media_manifest（与 Web 同字段名，多带本地媒体路径一份）；
//   - CSV：与 Web 逐列一致（日期,地点,区域,评分,人均,摘要,公开理由,标签,同步状态）。

import type { SqlDatabase } from '../db/database'

export interface ExportPlace {
  id: string
  name: string
  area: string | null
  lat: number | null
  lng: number | null
  coord_precision: string
  is_private: number
  demo: number
  sync_status: string
  created_at: string | null
  updated_at: string | null
}

export interface ExportEntry {
  id: string
  place_id: string
  visit_date: string
  rating: number | null
  budget: number | null
  transcript: string | null
  note_private: string | null
  note_public: string | null
  summary: string | null
  cover_media_id: string | null
  is_private: number
  demo: number
  sync_status: string
  created_at: string | null
  updated_at: string | null
}

export interface ExportMedia {
  id: string
  entry_id: string
  place_id: string
  local_display_path: string | null
  local_thumb_path: string | null
  demo_uri: string | null
  remote_path: string | null
  remote_thumb_path: string | null
  width: number | null
  height: number | null
  bytes: number | null
  taken_at: string | null
  sort_order: number
  sync_status: string
  demo: number
}

export interface ExportTag {
  id: string
  dimension_id: string
  parent_id: string | null
  name: string
  alias: string | null
  sort_order: number
}

export interface ExportDimension {
  id: string
  name: string
  kind: string
  sort_order: number
}

export interface ExportShare {
  id: string
  slug: string
  kind: string
  title: string
  owner_name: string | null
  status: string
  created_at: string
}

export interface ExportEntryTag {
  entry_id: string
  tag_id: string
}

export interface ExportBundle {
  places: ExportPlace[]
  entries: ExportEntry[]
  media: ExportMedia[]
  tags: ExportTag[]
  tagDimensions: ExportDimension[]
  shares: ExportShare[]
  entryTags: ExportEntryTag[]
}

export interface ExportFile {
  filename: string
  mime: string
  content: string
}

/** 读全量导出所需数据（只读；不含 outbox/conflicts/meta 等本机结构表）。 */
export function readExportBundle(db: SqlDatabase): ExportBundle {
  return {
    places: db.getAllSync<ExportPlace>('SELECT * FROM places ORDER BY name ASC'),
    entries: db.getAllSync<ExportEntry>('SELECT * FROM entries'),
    media: db.getAllSync<ExportMedia>(
      'SELECT * FROM media ORDER BY entry_id ASC, sort_order ASC, created_at ASC',
    ),
    tags: db.getAllSync<ExportTag>('SELECT * FROM tags ORDER BY sort_order ASC, name ASC'),
    tagDimensions: db.getAllSync<ExportDimension>(
      'SELECT * FROM tag_dimensions ORDER BY sort_order ASC, name ASC',
    ),
    shares: db.getAllSync<ExportShare>('SELECT * FROM share_snapshots ORDER BY created_at ASC'),
    entryTags: db.getAllSync<ExportEntryTag>('SELECT entry_id, tag_id FROM entry_tags ORDER BY rowid ASC'),
  }
}

/** 导出文件名（Web 同前缀；用日期区分批次）。 */
export function exportFilename(kind: 'json' | 'csv', date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `place-journal-export-${y}-${m}-${d}.${kind}`
}

/** JSON 导出（结构与 Web 一致；media_manifest 的 storage_path 回退本地路径）。 */
export function toExportJson(bundle: ExportBundle, now: Date = new Date()): ExportFile {
  const tagName = new Map(bundle.tags.map((t) => [t.id, t.name]))
  const payload = {
    exported_at: now.toISOString(),
    schema_version: 1,
    places: bundle.places,
    entries: bundle.entries,
    tags: bundle.tags,
    tag_dimensions: bundle.tagDimensions,
    shares: bundle.shares,
    entry_tags: bundle.entryTags.map((et) => ({ ...et, tag_name: tagName.get(et.tag_id) ?? '' })),
    media_manifest: bundle.media.map((m) => ({
      id: m.id,
      entry_id: m.entry_id,
      place_id: m.place_id,
      order: m.sort_order,
      storage_path: m.remote_path ?? m.local_display_path ?? '(本地未同步)',
      local_thumb_path: m.local_thumb_path,
      bytes: m.bytes,
      width: m.width,
      height: m.height,
      taken_at: m.taken_at,
    })),
  }
  return {
    filename: exportFilename('json', now),
    mime: 'application/json',
    content: JSON.stringify(payload, null, 2),
  }
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/** CSV 导出：表头与列序逐字对齐 Web `exportCsv`；带 BOM 便于 Excel 打开中文。 */
export function toExportCsv(bundle: ExportBundle, now: Date = new Date()): ExportFile {
  const placeById = new Map(bundle.places.map((p) => [p.id, p]))
  const tagName = new Map(bundle.tags.map((t) => [t.id, t.name]))
  const tagsByEntry = new Map<string, string[]>()
  for (const et of bundle.entryTags) {
    const list = tagsByEntry.get(et.entry_id)
    if (list) list.push(et.tag_id)
    else tagsByEntry.set(et.entry_id, [et.tag_id])
  }

  const lines = ['日期,地点,区域,评分,人均,摘要,公开理由,标签,同步状态']
  for (const e of [...bundle.entries].sort((a, b) => a.visit_date.localeCompare(b.visit_date))) {
    const place = placeById.get(e.place_id)
    const tagNames = (tagsByEntry.get(e.id) ?? []).map((id) => tagName.get(id) ?? '')
    lines.push(
      [
        e.visit_date,
        place?.name ?? '',
        place?.area ?? '',
        e.rating ?? '',
        e.budget ?? '',
        e.summary ?? '',
        e.note_public ?? '',
        tagNames.join('|'),
        e.sync_status,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return {
    filename: exportFilename('csv', now),
    mime: 'text/csv',
    content: '\ufeff' + lines.join('\n'),
  }
}
