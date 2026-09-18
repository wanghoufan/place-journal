// 移动端领域类型（T012）与 Web↔Mobile 云端行合同。
//
// 真源对照（R-01）：
//   1. Web 领域：根 `src/lib/types.ts`
//   2. 云端行：根 `src/lib/sync.ts` 的 placeRow/entryRow/dimRow/tagRow/shareItemPayload
//      + 根 `src/lib/shares.ts` 的 public_share_read 映射
//   3. 数据库发布事实：`docs/db/送审材料清单丨habit_tracker丨发布后收口核对.md`
//      （8 表全 RLS、32 策略、11 触发器、5 函数、29 索引；anon 表权限 0）
//
// 命名：领域实体沿用 Web 的 camelCase；云端行（DB/PostgREST 线合同）用 snake_case。
// 三层转换集中在 `mapping.ts`，业务代码不直接碰 snake_case。
//
// ── R-01 逐项差异（移动端 vs Web）──────────────────────────────────────────
//   D1. Blob：Web 的 `MediaItem.display/thumb` 是运行时 Blob；SQLite 不能存 Blob，
//       移动端改为 App documents 文件路径 `localDisplayPath/localThumbPath`，云端行
//       字段名不变（storage_path/thumb_path）。
//   D2. 图片 URL：Web 的 `ShareItem.photos` 是 `blob:` URL；移动端存 `file://` 本地
//       路径。该字段永不进云端 payload（白名单剔除），仅本地分享长图用。
//   D3. 归属：Web 领域实体不带 owner（隐式取会话）；移动端云端行显式带
//       `owner_user_id`，本地归属由 meta `bound_owner_user_id` 状态机管理（T021）。
//   D4. 同步锁：Web 用 IndexedDB outbox + meta；移动端语义相同但落在 SQLite，
//       `revision/baseRevision/sync` 字段与 Web 逐字段一致，保证跨端 optimistic lock。
//   D5. demo：保留 `demo` 标记与 Web 同语义（FR-018 / 计划 §7.7：demo 行不上云）。
//   D6. `AiOrganizeResult` / `RecordDraft` 等 UI 草稿类型属后续 Task（T091+），
//       本 Task 只落 T012–T013 所需的领域实体 + 云端行 + 分享白名单合同。
// ───────────────────────────────────────────────────────────────────────────

/** 本地同步状态，与 Web `src/lib/types.ts` 完全一致。 */
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'failed' | 'conflict'

/** 坐标精度，对应云端 `coord_precision` CHECK（exact/approx/hidden）。 */
export type CoordPrecision = 'exact' | 'approx' | 'hidden'

/** 标签维度种类，与 Web `DimensionKind` 一致。 */
export type DimensionKind = 'region' | 'type' | 'scene' | 'crowd' | 'custom'

/** 分享快照种类，对应云端 `share_snapshots.kind`。 */
export type ShareKind = 'single' | 'list'

/** 分享快照状态，对应云端 `share_snapshots.status`。 */
export type ShareStatus = 'active' | 'revoked'

// ── 领域实体（本地 SQLite + UI 使用，camelCase，逐字段对齐 Web）──────────────

export interface Place {
  id: string
  name: string
  area?: string
  lat?: number
  lng?: number
  coordPrecision?: CoordPrecision
  isPrivate?: boolean
  revision?: number
  baseRevision?: number
  demo?: boolean
  sync: SyncStatus
  createdAt: string
  updatedAt: string
}

export interface Entry {
  id: string
  placeId: string
  visitDate: string // YYYY-MM-DD
  rating?: number // 1-5
  budget?: number // 人均
  transcript?: string // 已确认转写（私密）
  notePrivate?: string // 私密感受
  notePublic?: string // 公开分享理由
  summary?: string
  coverMediaId?: string
  tagIds: string[] // 仅叶子标签；关联存 entry_tags 表
  isPrivate?: boolean
  revision?: number
  baseRevision?: number
  demo?: boolean
  sync: SyncStatus
  syncError?: string
  createdAt: string
  updatedAt: string
}

// [R-01 D1] Web: display?: Blob / thumb?: Blob → 移动端: 本地文件路径。
export interface MediaItem {
  id: string
  entryId: string
  placeId: string
  localDisplayPath?: string // App documents 内 display 图路径（替代 Web Blob）
  localThumbPath?: string // App documents 内 thumb 图路径（替代 Web Blob）
  demoUri?: string // 演示数据用远端 URL（与 Web 同义）
  width?: number
  height?: number
  bytes?: number
  takenAt?: string
  order: number
  remotePath?: string // 云端 storage_path
  remoteThumbPath?: string // 云端 thumb_path
  sync: SyncStatus
}

export interface Dimension {
  id: string
  name: string
  kind: DimensionKind
  sortOrder: number
  revision?: number
  baseRevision?: number
  demo?: boolean
}

export interface Tag {
  id: string
  dimensionId: string
  parentId?: string | null
  name: string
  alias?: string
  sortOrder: number
  revision?: number
  baseRevision?: number
  demo?: boolean
}

// [R-01 D2] photos 在 Web 为 blob: URL，移动端为 file:// 路径；永不进云端 payload。
export interface ShareItem {
  clientId: string // 稳定幂等键：share_items.client_id
  entryId?: string // 来源记录 id（云端 payload 白名单剔除）
  coverMediaId?: string // 封面媒体 id（据此上传公开桶缩略图）
  placeName: string
  area?: string
  rating?: number
  budget?: number
  reason?: string
  tags?: string[]
  coverUri?: string // 公开桶 URL 或本地快照 URI
  photos?: string[] // 仅本地分享长图用（封面第一）；云端白名单不含
  lat?: number
  lng?: number
  coordHidden?: boolean
}

export interface ShareSnapshot {
  id: string
  slug: string
  kind: ShareKind
  title: string
  ownerName?: string
  items: ShareItem[]
  status: ShareStatus
  createdAt: string
}

// ── 云端行合同（snake_case，PostgREST/habit_tracker 线格式）──────────────────
// 证据：`src/lib/sync.ts`。`id` 与 `client_id` 由客户端生成同一 uuid（幂等键）。
// `owner_user_id` 由客户端从会话取，服务端 RLS 校验且触发器禁止改写。
// `revision` 由服务端触发器强制单调 +1；客户端 UPDATE 必须带 expected revision。

export const CLOUD_TABLES = [
  'places',
  'entries',
  'media',
  'tag_dimensions',
  'tags',
  'entry_tags',
  'share_snapshots',
  'share_items',
] as const
export type CloudTable = (typeof CLOUD_TABLES)[number]

export interface PlaceRow {
  id: string
  owner_user_id: string
  name: string
  area: string | null
  lat: number | null
  lng: number | null
  coord_precision: CoordPrecision
  is_private: boolean
  client_id: string
  revision: number
  created_at?: string
  updated_at?: string
}

export interface EntryRow {
  id: string
  owner_user_id: string
  place_id: string
  visit_date: string
  rating: number | null
  budget: number | null
  transcript: string | null
  note_private: string | null
  note_public: string | null
  summary: string | null
  cover_media_id: string | null
  is_private: boolean
  client_id: string
  revision: number
  created_at?: string
  updated_at?: string
}

// media 无 revision（辅助对象，受控 upsert 幂等键 owner_user_id,client_id）。
export interface MediaRow {
  id: string
  owner_user_id: string
  entry_id: string
  place_id: string
  storage_path: string
  thumb_path: string | null
  width: number | null
  height: number | null
  bytes: number | null
  taken_at: string | null
  sort_order: number
  client_id: string
  created_at?: string
  updated_at?: string
}

export interface TagDimensionRow {
  id: string
  owner_user_id: string
  name: string
  kind: DimensionKind
  sort_order: number
  revision: number
  created_at?: string
  updated_at?: string
}

export interface TagRow {
  id: string
  owner_user_id: string
  dimension_id: string
  parent_id: string | null
  name: string
  alias: string | null
  sort_order: number
  revision: number
  created_at?: string
  updated_at?: string
}

// 关联表：唯一键 (entry_id, tag_id)，无独立 revision。
export interface EntryTagRow {
  entry_id: string
  tag_id: string
  owner_user_id: string
}

export interface ShareSnapshotRow {
  id: string
  owner_user_id: string
  slug: string
  kind: ShareKind
  title: string
  owner_display_name: string | null
  payload: Record<string, unknown>
  status: ShareStatus
  client_id: string
  created_at: string
  updated_at?: string
}

export interface ShareItemRow {
  id?: string
  snapshot_id: string
  owner_user_id: string
  sort_order: number
  item: ShareItemPayload
  client_id: string
}

// ── 分享白名单（RF-03 / R-12）───────────────────────────────────────────────
// 证据：`src/lib/sync.ts` shareItemPayload + `docs/db/ENV1-实测记录丨2026-09-04.md` §⑥
// 匿名可见仅 7 个基础字段 + cover_url；note_private/transcript/精确坐标永不进 payload。
export interface ShareWhitelistPayload {
  name: string
  area: string | null
  rating: number | null
  budget: number | null
  note_public: string | null
  tags: string[]
  coord_precision: CoordPrecision
}

export interface ShareItemPayload extends ShareWhitelistPayload {
  cover_url: string | null
}

export const SHARE_WHITELIST_KEYS: readonly (keyof ShareItemPayload)[] = [
  'name',
  'area',
  'rating',
  'budget',
  'note_public',
  'tags',
  'coord_precision',
  'cover_url',
] as const

// ── RPC `habit_tracker.public_share_read(p_slug)` 合同 ──────────────────────
// 证据：`src/lib/shares.ts` fetchCloudShare + ENV1 实测（嵌套结构 {id,item,sort_order}）。
export interface PublicShareReadInput {
  p_slug: string
}

export interface PublicShareReadSnapshot {
  id: string
  slug: string
  kind: ShareKind
  title: string
  owner_display_name: string | null
  created_at: string
}

export interface PublicShareReadItem {
  id: string
  item: ShareItemPayload
  sort_order: number
}

export interface PublicShareReadResult {
  snapshot: PublicShareReadSnapshot | null
  items: PublicShareReadItem[]
}

// ── Storage 合同 ────────────────────────────────────────────────────────────
// 证据：`src/lib/sync.ts` upload_media/create_share 分支 + ENV1 实测记录。
export const PRIVATE_MEDIA_BUCKET = 'habit-tracker-media-private'
export const SHARE_MEDIA_BUCKET = 'habit-tracker-media-share'

/** 私有桶对象基路径：`{owner}/{placeId}/{mediaId}`（thumb.jpg / display.jpg）。 */
export function privateMediaBasePath(owner: string, placeId: string, mediaId: string): string {
  return `${owner}/${placeId}/${mediaId}`
}

/** 私有桶 display 对象路径。 */
export function privateDisplayPath(owner: string, placeId: string, mediaId: string): string {
  return `${privateMediaBasePath(owner, placeId, mediaId)}/display.jpg`
}

/** 私有桶 thumb 对象路径。 */
export function privateThumbPath(owner: string, placeId: string, mediaId: string): string {
  return `${privateMediaBasePath(owner, placeId, mediaId)}/thumb.jpg`
}

/** 公开桶分享封面路径：`{owner}/{snapshotId}/{shareItemClientId}.jpg`。 */
export function shareCoverPath(owner: string, snapshotId: string, shareItemClientId: string): string {
  return `${owner}/${snapshotId}/${shareItemClientId}.jpg`
}
