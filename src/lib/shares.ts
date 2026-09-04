// 分享快照：字段白名单构建 + slug + 分享链接（方案 4.1/4.2）
import type { Entry, Place, MediaItem, ShareSnapshot, ShareItem } from './types'
import { repo } from './idb'
import { uuid } from './uuid'

// slug：22 位 base36 ≈ 114 bit 熵（审查意见 §8.2 方案 B：链接不可枚举）。
// 与 0001_init.sql 的 CHECK（≥16 位 [A-Za-z0-9_-]）兼容。
const slug = () => {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => (b % 36).toString(36)).join('')
}

function toShareItem(entry: Entry, place: Place, media: MediaItem[], tagNames: string[] = []): ShareItem {
  // 白名单：封面展示图、名称、区域、星级、预算、公开理由、公开标签、（低精度）坐标
  // 绝不包含：原始语音、私密笔记、完整到访历史、未选照片、EXIF、精确坐标
  // clientId：share_items.client_id 稳定幂等键（审查意见 §6 方案 B）
  // tags（QA V0.2 OBS-1）：标签 chip 属公开字段，补齐填充，分享页才渲染。
  const cover = media.find((m) => m.id === entry.coverMediaId) ?? media.find((m) => m.entryId === entry.id)
  const precision = place.coordPrecision ?? 'exact'
  return {
    clientId: uuid() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    coverMediaId: cover?.id,
    placeName: place.name,
    area: place.area,
    rating: entry.rating,
    budget: entry.budget,
    reason: entry.notePublic || entry.summary,
    coverUri: cover?.demoUri,
    tags: tagNames,
    lat: precision === 'exact' || precision === 'approx' ? roundCoord(place.lat) : undefined,
    lng: precision === 'exact' || precision === 'approx' ? roundCoord(place.lng) : undefined,
    coordHidden: precision === 'hidden',
  }
}
// entry.tagIds → 标签名（按本地标签库映射，保持选择顺序）
async function tagNamesOf(entry: Entry): Promise<string[]> {
  const tags = await repo.tags()
  return entry.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean) as string[]
}
function roundCoord(v?: number) { return v == null ? undefined : Math.round(v * 100) / 100 } // ~1km 精度

export async function createSingleShare(entry: Entry, place: Place, ownerName?: string): Promise<ShareSnapshot> {
  const media = await repo.media()
  const s: ShareSnapshot = {
    id: uuid() ?? String(Date.now()),
    slug: slug(), kind: 'single', title: place.name, ownerName,
    items: [toShareItem(entry, place, media, await tagNamesOf(entry))],
    status: 'active', createdAt: new Date().toISOString(),
  }
  await repo.saveShare(s)
  return s
}

export async function createListShare(title: string, pairs: { entry: Entry; place: Place }[], ownerName?: string): Promise<ShareSnapshot> {
  const media = await repo.media()
  const s: ShareSnapshot = {
    id: uuid() ?? String(Date.now()),
    slug: slug(), kind: 'list', title, ownerName,
    items: await Promise.all(pairs.map(async ({ entry, place }) => toShareItem(entry, place, media, await tagNamesOf(entry)))),
    status: 'active', createdAt: new Date().toISOString(),
  }
  await repo.saveShare(s)
  return s
}

export function shareUrl(s: ShareSnapshot): string {
  const prefix = s.kind === 'single' ? '/s/p/' : '/s/l/'
  return `${window.location.origin}${prefix}${s.slug}`
}

// 云端分享读取（审查意见 §8.2 方案 B）：匿名无表权限，只能经 RPC 函数按 slug
// 取一张 active 快照（habit_tracker.public_share_read），不可枚举。
export async function fetchCloudShare(slugStr: string, kind: 'single' | 'list'): Promise<ShareSnapshot | null> {
  const { cloudConfigured } = await import('./env')
  if (!cloudConfigured()) return null
  const { supabase, DB_SCHEMA } = await import('./supabase')
  const { data, error } = await supabase().schema(DB_SCHEMA).rpc('public_share_read', { p_slug: slugStr })
  if (error || !data) return null
  const s = (data as any).snapshot
  const items = ((data as any).items ?? []) as any[]
  if (!s || s.kind !== kind) return null
  return {
    id: s.id, slug: s.slug, kind: s.kind, title: s.title, ownerName: s.owner_display_name ?? '',
    items: items.map((raw: any) => {
      // public_share_read 返回 share_items 行：{id, item:{...白名单字段}, sort_order}
      // （item 为 jsonb 列，2026-09-04 匿名页端到端实测发现映射错位）；兼容扁平结构。
      const i = raw?.item ?? raw
      return {
        clientId: '', placeName: i.name, area: i.area ?? undefined, rating: i.rating ?? undefined,
        budget: i.budget != null ? Number(i.budget) : undefined, reason: i.note_public ?? undefined,
        tags: i.tags ?? undefined, coverUri: i.cover_url ?? undefined,
        coordHidden: i.coord_precision === 'hidden',
      }
    }),
    status: 'active', createdAt: s.created_at,
  }
}

export function copyText(t: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(t)
  const ta = document.createElement('textarea')
  ta.value = t; document.body.appendChild(ta); ta.select()
  document.execCommand('copy'); ta.remove()
  return Promise.resolve()
}

export const searchLine = (item: ShareItem) => `${item.placeName}${item.area ? ' · ' + item.area.split('·').pop()?.trim() : ''}`
