// 本地优先数据层：IndexedDB（idb）+ 轻量响应式通知
import { openDB, type IDBPDatabase } from 'idb'
import type { Place, Entry, MediaItem, Dimension, Tag, ShareSnapshot } from './types'
import { cloudConfigured } from './env'

const DB_NAME = 'place-journal'
// v2：outbox 补开 autoIncrement（v1 的 keyPath='seq' 无自增，enqueue 的 add 无 seq 会 DataError）
const DB_VERSION = 2

export type OutboxOp =
  | { kind: 'upsert_place'; id: string }
  | { kind: 'upsert_entry'; id: string }
  | { kind: 'upload_media'; id: string }
  | { kind: 'upsert_tags' }
  | { kind: 'delete_tags'; ids: string[] }
  | { kind: 'create_share'; id: string }
  | { kind: 'revoke_share'; id: string }

export interface OutboxRow { seq?: number; op: OutboxOp; createdAt: string; attempts: number; lastError?: string }

export interface DB {
  places: Place[]
  entries: Entry[]
  media: MediaItem[]
  dimensions: Dimension[]
  tags: Tag[]
  shares: ShareSnapshot[]
}

let dbp: Promise<IDBPDatabase> | null = null
function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        for (const s of ['places', 'entries', 'media', 'dimensions', 'tags', 'shares', 'meta']) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: keyOf(s) })
        }
        // outbox 是临时队列，可安全重建；v1 未开自增，v2 重建
        if (d.objectStoreNames.contains('outbox')) {
          if (oldVersion < 2) { d.deleteObjectStore('outbox'); d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true }) }
        } else {
          d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
        }
      },
    })
  }
  return dbp
}
function keyOf(store: string): string {
  return store === 'outbox' ? 'seq' : store === 'meta' ? 'key' : 'id'
}

// ---- 响应式通知 ----
const listeners = new Set<() => void>()
let version = 0
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function getVersion() { return version }
function bump() { version++; listeners.forEach((l) => l()) }

export async function all<K extends keyof DB>(store: K): Promise<DB[K] extends Array<infer T> ? T[] : never> {
  const d = await db()
  return (await d.getAll(store as string)) as any
}

async function put(store: string, row: any) { const d = await db(); await d.put(store, row); bump() }
async function del(store: string, key: any) { const d = await db(); await d.delete(store, key); bump() }
export async function bulkPut(store: string, rows: any[]) {
  const d = await db()
  const tx = d.transaction(store, 'readwrite')
  for (const r of rows) tx.store.put(r)
  await tx.done
  bump()
}

// ---- meta ----
export async function getMeta<T>(key: string): Promise<T | undefined> {
  const d = await db(); return (await d.get('meta', key))?.value
}
export async function setMeta(key: string, value: any) {
  const d = await db(); await d.put('meta', { key, value })
}

// ---- outbox ----
export async function enqueue(op: OutboxOp) {
  if (!cloudConfigured()) return // 未配置云端：队列不入，数据保持 local
  const d = await db()
  await d.add('outbox', { op, createdAt: new Date().toISOString(), attempts: 0 } as OutboxRow)
  bump()
}
export async function outboxAll(): Promise<OutboxRow[]> {
  const d = await db(); return (await d.getAll('outbox')) as OutboxRow[]
}
export async function outboxRemove(seq: number) { await del('outbox', seq) }
export async function outboxFail(seq: number, err: string) {
  const d = await db()
  const row = (await d.get('outbox', seq)) as OutboxRow
  if (row) await d.put('outbox', { ...row, attempts: row.attempts + 1, lastError: err })
}

// ---- 业务仓库 ----
export const repo = {
  async places(): Promise<Place[]> { return all('places') },
  async entries(): Promise<Entry[]> { return all('entries') },
  async media(): Promise<MediaItem[]> { return all('media') },
  async dimensions(): Promise<Dimension[]> { return all('dimensions') },
  async tags(): Promise<Tag[]> { return all('tags') },
  async shares(): Promise<ShareSnapshot[]> { return all('shares') },

  async savePlace(p: Place, syncQueue = true) {
    // 规范（V1.2 §5.2）：核心实体每次本地保存 revision +1
    await put('places', { ...p, revision: (p.revision ?? 0) + 1 })
    if (syncQueue) await enqueue({ kind: 'upsert_place', id: p.id })
  },
  async saveEntry(e: Entry, syncQueue = true) {
    await put('entries', { ...e, revision: (e.revision ?? 0) + 1 })
    if (syncQueue) await enqueue({ kind: 'upsert_entry', id: e.id })
  },
  async saveMedia(m: MediaItem, syncQueue = true) {
    await put('media', m)
    if (syncQueue && (m.display || m.thumb)) await enqueue({ kind: 'upload_media', id: m.id })
  },
  async deleteEntry(id: string) {
    const d = await db()
    const media = (await d.getAll('media')) as MediaItem[]
    const tx = d.transaction(['entries', 'media'], 'readwrite')
    for (const m of media.filter((m) => m.entryId === id)) tx.objectStore('media').delete(m.id)
    await tx.objectStore('entries').delete(id)
    await tx.done
    bump()
    // 云端删除交给 Cascading + 后续版本；V1 本地删除即可
  },
  async saveTags(dimensions: Dimension[], tags: Tag[]) {
    await bulkPut('dimensions', dimensions)
    await bulkPut('tags', tags)
    await enqueue({ kind: 'upsert_tags' })
  },
  // 真删除：bulkPut 是 upsert 语义（只写不删），此前 TagsPage 删除传「缺失后的全量数组」等于没删
  // ids 顺序由调用方保证「子标签在前、父标签在后」（云端 tags_parent_owner_fk 要求先删子）
  async deleteTags(ids: string[]) {
    if (!ids.length) return
    const idSet = new Set(ids)
    const d = await db()
    // 同步清理 entry.tagIds 悬空引用：否则 ensureTagsInCloud 的 rescue 会在该记录
    // 下次重推时按旧 id 把标签重建回云端（复活）。仅改本地行，不 enqueue（避免整条记录重推 bump revision）
    const entries = (await d.getAll('entries')) as Entry[]
    const tx = d.transaction(['entries', 'tags'], 'readwrite')
    for (const e of entries) {
      if (e.tagIds?.some((t) => idSet.has(t))) {
        await tx.objectStore('entries').put({ ...e, tagIds: e.tagIds.filter((t) => !idSet.has(t)) })
      }
    }
    for (const id of ids) await tx.objectStore('tags').delete(id)
    await tx.done
    await enqueue({ kind: 'delete_tags', ids: [...ids] })
    bump()
  },
  async saveShare(s: ShareSnapshot, syncQueue = true) {
    await put('shares', s)
    if (syncQueue) await enqueue({ kind: 'create_share', id: s.id })
  },
  async revokeShare(id: string) {
    const d = await db(); const s = await d.get('shares', id)
    if (s) { s.status = 'revoked'; await d.put('shares', s); bump() }
    await enqueue({ kind: 'revoke_share', id })
  },
  async clearDemo() {
    const d = await db()
    const tx = d.transaction(['places', 'entries', 'media'], 'readwrite')
    for (const store of ['places', 'entries', 'media']) {
      let cur = await tx.objectStore(store).openCursor()
      while (cur) { if (cur.value.demo) await cur.delete(); cur = await cur.continue() }
    }
    await tx.done
    await setMeta('demo_seeded', true) // 已清除，不再自动恢复
    bump()
  },
  async wipeLocal() {
    const d = await db()
    for (const s of ['places', 'entries', 'media', 'dimensions', 'tags', 'shares', 'outbox']) await d.clear(s)
    await setMeta('demo_seeded', false)
    bump()
  },
}
