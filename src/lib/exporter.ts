// 数据自主：导出结构化 JSON / CSV + 媒体清单（方案 2.1 / M6）
import type { Entry, MediaItem, Place, Tag, Dimension, ShareSnapshot } from './types'
import { repo } from './idb'

interface DbBundle {
  places: Place[]; entries: Entry[]; media: MediaItem[]; tags: Tag[]; dimensions: Dimension[]; shares: ShareSnapshot[]
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function exportJson(data: DbBundle) {
  const payload = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    places: data.places,
    entries: data.entries,
    tags: data.tags,
    tag_dimensions: data.dimensions,
    shares: data.shares,
    media_manifest: data.media.map((m) => ({
      id: m.id, entry_id: m.entryId, place_id: m.placeId, order: m.order,
      storage_path: m.remotePath ?? '(本地未同步)', bytes: m.bytes, width: m.width, height: m.height, taken_at: m.takenAt,
    })),
  }
  download(JSON.stringify(payload, null, 2), `place-journal-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
}

export async function exportCsv(data: DbBundle) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const tagName = (id: string) => data.tags.find((t) => t.id === id)?.name ?? ''
  const lines = ['日期,地点,区域,评分,人均,摘要,公开理由,标签,同步状态']
  for (const e of [...data.entries].sort((a, b) => a.visitDate.localeCompare(b.visitDate))) {
    const p = data.places.find((x) => x.id === e.placeId)
    lines.push([
      e.visitDate, p?.name ?? '', p?.area ?? '', e.rating ?? '', e.budget ?? '',
      e.summary ?? '', e.notePublic ?? '', e.tagIds.map(tagName).join('|'), e.sync,
    ].map(esc).join(','))
  }
  download('\ufeff' + lines.join('\n'), `place-journal-export-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
}

export async function storageUsage(): Promise<string> {
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate()
    if (usage != null) return usage < 1024 * 1024 ? `${Math.round(usage / 1024)} KB` : `${(usage / 1024 / 1024).toFixed(1)} MB`
  }
  return '—'
}
export { repo }
