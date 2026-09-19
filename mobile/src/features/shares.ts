// 分享快照本地段（TASK-DEV-12；SDD 分享段 T096 的本地侧）。
//
// 只写本地 SQLite + outbox，不接网络：真云发布/匿名检视留 T062。
//   - 创建：entry → 白名单 ShareItem（公开字段唯一真源＝`shareItemToPayload`）→
//     share_snapshots + share_items 落库＋`create_share` op 入队（同一事务）；
//   - 撤销：本地 `status='revoked'` ＋ `revoke_share` op 入队（幂等：已撤销不重复入队）；
//   - slug：22 位 base36（与 Web `src/lib/shares.ts` slug 同口径，兼容云端 ≥16 位 CHECK）。
//
// 白名单口径（R-12）：payload 只含 7 个基础字段；私密感受、转写、精确坐标、
// 照片与来源 id 永不进 payload（本地列另存，仅本地分享长图/推送封面用）。

import type { SqlDatabase, SqlValue } from '../db/database'
import type { EntityRow, Repository } from '../db/repository'
import { newUuid } from '../domain/ids'
import { shareItemToPayload } from '../domain/mapping'
import type { CoordPrecision, ShareItem, ShareSnapshot } from '../domain/types'
import { insertOutboxOp } from '../sync/outbox'

/** 分享参数非法（缺记录/缺地点/空选择）。 */
export class ShareValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareValidationError'
  }
}

// ── slug ───────────────────────────────────────────────────────────────────

const SLUG_LENGTH = 22

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes)
    return bytes
  }
  // 无 WebCrypto 的环境退回 Math.random：仅用于本地 slug（防枚举即可，非密钥材料）。
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

/**
 * 22 位 base36 slug（本地防枚举口径；`bytes` 仅供单测注入）。
 *
 * 口径说明（沿用不改，P2-1）：每字节 `b % 36` 相比 256 存在模偏差（余 0–3 的字符
 * 出现概率略高，约 +0.4%），随机性不是密码学级；但本 slug 的目标是「本地分享链接
 * 不可枚举 + 兼容云端 ≥16 位长度 CHECK」，Web `src/lib/shares.ts` 同算法同口径，
 * 换算法会造成两端不兼容，故保留现状、仅在此注明。
 */
export function newSlug(bytes: Uint8Array = randomBytes(SLUG_LENGTH)): string {
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

// ── 白名单 ShareItem 构建（纯函数，便于单测）────────────────────────────────

export interface ShareItemSource {
  entryId: string
  clientId?: string
  coverMediaId?: string
  placeName: string
  area?: string
  rating?: number
  budget?: number
  /** 公开理由；缺省回退 summary（与 Web `toShareItem` 一致）。 */
  notePublic?: string
  summary?: string
  tags?: string[]
  coverUri?: string
  /** 仅本地分享长图用；云端白名单剔除。 */
  photos?: string[]
  lat?: number
  lng?: number
  coordPrecision?: CoordPrecision
}

/** ~1km 精度（与 Web `roundCoord` 一致）；hidden 时一律不外泄数值。 */
export function roundCoord(value?: number): number | undefined {
  return value == null ? undefined : Math.round(value * 100) / 100
}

/** 数值守卫（P2-2）：NaN/±Infinity 一律回退 undefined，避免污染白名单 payload 与 JSON。 */
function optFinite(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 由来源数据构建白名单 ShareItem：
 * 私密感受（notePrivate）、转写（transcript）不进入本结构，无法被下游意外带出。
 * budget 经有限数守卫（P2-2）：NaN/Infinity → undefined（payload 出 null），不落库不序列化。
 */
export function buildShareItem(src: ShareItemSource): ShareItem {
  const coordHidden = src.coordPrecision === 'hidden'
  return {
    clientId: src.clientId ?? newUuid(),
    entryId: src.entryId,
    coverMediaId: src.coverMediaId,
    placeName: src.placeName,
    area: src.area,
    rating: src.rating,
    budget: optFinite(src.budget),
    reason: src.notePublic || src.summary || undefined,
    tags: src.tags ?? [],
    coverUri: src.coverUri,
    photos: src.photos ?? [],
    lat: coordHidden ? undefined : roundCoord(src.lat),
    lng: coordHidden ? undefined : roundCoord(src.lng),
    coordHidden,
  }
}

// ── 本地行映射 ──────────────────────────────────────────────────────────────

const SHARE_ITEM_COLUMNS = [
  'snapshot_id', 'client_id', 'entry_id', 'cover_media_id', 'sort_order', 'place_name',
  'area', 'rating', 'budget', 'reason', 'tags_json', 'cover_uri', 'photos_json', 'lat', 'lng',
  'coord_hidden',
] as const

/** 公开列取自白名单 payload（唯一真源），本地专用列另存。 */
export function shareItemRowValues(snapshotId: string, item: ShareItem, sortOrder: number): SqlValue[] {
  const payload = shareItemToPayload(item)
  return [
    snapshotId,
    item.clientId,
    item.entryId ?? null,
    item.coverMediaId ?? null,
    sortOrder,
    payload.name,
    payload.area,
    payload.rating,
    payload.budget,
    payload.note_public,
    JSON.stringify(payload.tags),
    item.coverUri ?? null,
    JSON.stringify(item.photos ?? []),
    item.lat ?? null,
    item.lng ?? null,
    item.coordHidden ? 1 : 0,
  ]
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** 从本地行读取分享项（再经 `shareItemToPayload` 即得公开 payload）。 */
export function shareItemFromRow(row: EntityRow): ShareItem {
  return {
    clientId: String(row.client_id),
    entryId: optString(row.entry_id),
    coverMediaId: optString(row.cover_media_id),
    placeName: String(row.place_name),
    area: optString(row.area),
    rating: optNumber(row.rating),
    budget: optNumber(row.budget),
    reason: optString(row.reason),
    tags: parseStringArray(row.tags_json),
    coverUri: optString(row.cover_uri),
    photos: parseStringArray(row.photos_json),
    lat: optNumber(row.lat),
    lng: optNumber(row.lng),
    coordHidden: row.coord_hidden === 1,
  }
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

// ── 创建 ────────────────────────────────────────────────────────────────────

/** 读取一条记录的媒体（封面优先，其余按 sort_order）。 */
function mediaOfEntry(db: SqlDatabase, entryId: string): EntityRow[] {
  return db.getAllSync<EntityRow>(
    'SELECT * FROM media WHERE entry_id = ? ORDER BY sort_order ASC, created_at ASC',
    entryId,
  )
}

function tagNamesOfEntry(db: SqlDatabase, entryId: string): string[] {
  const ids = db
    .getAllSync<{ tag_id: string }>('SELECT tag_id FROM entry_tags WHERE entry_id = ? ORDER BY rowid ASC', entryId)
    .map((r) => r.tag_id)
  return ids
    .map((id) => db.getFirstSync<{ name: string }>('SELECT name FROM tags WHERE id = ?', id)?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

/** entry + place（+媒体/标签）→ 白名单 ShareItem。 */
function shareItemForEntry(db: SqlDatabase, entry: EntityRow, place: EntityRow, clientId?: string): ShareItem {
  const entryId = String(entry.id)
  const media = mediaOfEntry(db, entryId)
  const coverId = optString(entry.cover_media_id)
  const cover = media.find((m) => String(m.id) === coverId) ?? media[0]
  const ordered = cover ? [cover, ...media.filter((m) => String(m.id) !== String(cover.id))] : media
  const photos = ordered
    .map((m) => optString(m.local_display_path) ?? optString(m.demo_uri))
    .filter((uri): uri is string => uri != null)

  return buildShareItem({
    clientId,
    entryId,
    coverMediaId: cover ? String(cover.id) : undefined,
    placeName: String(place.name),
    area: optString(place.area),
    rating: optNumber(entry.rating),
    budget: optNumber(entry.budget),
    notePublic: optString(entry.note_public),
    summary: optString(entry.summary),
    tags: tagNamesOfEntry(db, entryId),
    coverUri: cover
      ? optString(cover.local_thumb_path) ?? optString(cover.demo_uri) ?? optString(cover.local_display_path)
      : undefined,
    photos,
    lat: optNumber(place.lat),
    lng: optNumber(place.lng),
    coordPrecision: (optString(place.coord_precision) as CoordPrecision | undefined) ?? 'exact',
  })
}

function requireEntry(db: SqlDatabase, repo: Repository, entryId: string): { entry: EntityRow; place: EntityRow } {
  const entry = repo.get<EntityRow>('entries', entryId)
  if (!entry) throw new ShareValidationError('待分享的记录不存在')
  const place = repo.get<EntityRow>('places', String(entry.place_id))
  if (!place) throw new ShareValidationError('记录缺少地点，无法分享')
  return { entry, place }
}

/** 快照 + 分享项落库，并入队 `create_share`（同事务，全成或全败）。 */
function persistShare(db: SqlDatabase, snapshot: ShareSnapshot, now: string): void {
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO share_snapshots (id, slug, kind, title, owner_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.id,
      snapshot.slug,
      snapshot.kind,
      snapshot.title,
      snapshot.ownerName ?? null,
      snapshot.status,
      snapshot.createdAt,
      now,
    )
    snapshot.items.forEach((item, index) => {
      db.runSync(
        `INSERT INTO share_items (${SHARE_ITEM_COLUMNS.join(', ')})
         VALUES (${SHARE_ITEM_COLUMNS.map(() => '?').join(', ')})`,
        ...shareItemRowValues(snapshot.id, item, index),
      )
    })
    insertOutboxOp(db, { kind: 'create_share', entityId: snapshot.id }, { now })
  })
}

export interface CreateEntryShareInput {
  entryId: string
  ownerName?: string
  /** 单测注入固定 slug；缺省随机 22 位。 */
  slug?: string
  now?: string
}

/** 由一条记录创建 single 分享快照（本地段）。 */
export function createEntryShare(db: SqlDatabase, repo: Repository, input: CreateEntryShareInput): ShareSnapshot {
  const now = input.now ?? new Date().toISOString()
  const { entry, place } = requireEntry(db, repo, input.entryId)
  const snapshot: ShareSnapshot = {
    id: newUuid(),
    slug: input.slug ?? newSlug(),
    kind: 'single',
    title: String(place.name),
    ownerName: input.ownerName,
    items: [shareItemForEntry(db, entry, place)],
    status: 'active',
    createdAt: now,
  }
  persistShare(db, snapshot, now)
  return snapshot
}

export interface CreateListShareInput {
  entryIds: string[]
  title?: string
  ownerName?: string
  slug?: string
  now?: string
}

/** 由多条记录创建 list 分享快照（本地段），顺序＝入参顺序（去重去空）。 */
export function createListShare(db: SqlDatabase, repo: Repository, input: CreateListShareInput): ShareSnapshot {
  const now = input.now ?? new Date().toISOString()
  const seen = new Set<string>()
  const entryIds: string[] = []
  for (const id of input.entryIds) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    entryIds.push(id)
  }
  if (entryIds.length === 0) throw new ShareValidationError('至少选择一条记录')

  const items = entryIds.map((id) => {
    const { entry, place } = requireEntry(db, repo, id)
    return shareItemForEntry(db, entry, place)
  })
  const snapshot: ShareSnapshot = {
    id: newUuid(),
    slug: input.slug ?? newSlug(),
    kind: 'list',
    title: input.title?.trim() || `已选 ${entryIds.length} 个地点`,
    ownerName: input.ownerName,
    items,
    status: 'active',
    createdAt: now,
  }
  persistShare(db, snapshot, now)
  return snapshot
}

// ── 撤销（幂等）──────────────────────────────────────────────────────────────

export interface RevokeShareResult {
  /** 本次是否真的改了状态（false = 不存在或已撤销，无副作用）。 */
  changed: boolean
  opId: string | null
  reason: 'revoked' | 'already_revoked' | 'not_found'
}

/**
 * 撤销分享：本地置 revoked ＋ 入队 `revoke_share`（entityId = slug，与推送合同一致）。
 * 幂等：重复调用不重复入队；云端无此 slug 视为目的已达成（正常出队）。
 */
export function revokeShare(
  db: SqlDatabase,
  repo: Repository,
  input: { slug: string; now?: string },
): RevokeShareResult {
  const now = input.now ?? new Date().toISOString()
  const row = repo.read((d) =>
    d.getFirstSync<{ slug: string; status: string }>('SELECT slug, status FROM share_snapshots WHERE slug = ?', input.slug),
  )
  if (!row) return { changed: false, opId: null, reason: 'not_found' }
  if (row.status === 'revoked') return { changed: false, opId: null, reason: 'already_revoked' }

  let opId = ''
  db.withTransactionSync(() => {
    db.runSync("UPDATE share_snapshots SET status = 'revoked', updated_at = ? WHERE slug = ?", now, input.slug)
    opId = insertOutboxOp(db, { kind: 'revoke_share', entityId: input.slug }, { now })
  })
  return { changed: true, opId, reason: 'revoked' }
}
