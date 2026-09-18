// Web↔Mobile 行映射骨架（T013）。
//
// 本文件只做「领域实体（camelCase）↔ 云端行（snake_case）↔ RPC 结果」的纯函数转换，
// 不访问网络/SQLite。T063 起 push/pull 直接复用这些函数，保证与现役 Web
// `src/lib/sync.ts`、`src/lib/shares.ts` 的线合同逐字段一致（R-01 控制）。
//
// 约定：
//   - 核心实体（places/entries/tags/tag_dimensions）走 optimistic lock：
//     首推 INSERT，后续 `UPDATE ... WHERE id=? AND revision=baseRevision`；0 行 = 冲突。
//   - 辅助对象（media/share_items）走受控 upsert + 幂等键，不带 revision。
//   - `entry_tags` 由 entry.tagIds 差量同步（先增后删），不在此生成整包。

import type {
  CoordPrecision,
  Dimension,
  Entry,
  EntryRow,
  MediaItem,
  MediaRow,
  Place,
  PlaceRow,
  PublicShareReadResult,
  ShareItem,
  ShareItemPayload,
  ShareItemRow,
  ShareSnapshot,
  ShareSnapshotRow,
  ShareWhitelistPayload,
  Tag,
  TagDimensionRow,
  TagRow,
} from './types'

// ── places ─────────────────────────────────────────────────────────────────

export function placeToRow(p: Place, owner: string): PlaceRow {
  return {
    id: p.id,
    owner_user_id: owner,
    name: p.name,
    area: p.area ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    coord_precision: p.coordPrecision ?? 'exact',
    is_private: !!p.isPrivate,
    client_id: p.id,
    revision: p.revision ?? 1,
    updated_at: p.updatedAt,
  }
}

export function placeFromRow(r: PlaceRow): Place {
  return {
    id: r.id,
    name: r.name,
    area: r.area ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    coordPrecision: r.coord_precision,
    isPrivate: r.is_private,
    revision: r.revision,
    baseRevision: r.revision,
    sync: 'synced',
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  }
}

// ── entries ────────────────────────────────────────────────────────────────

export function entryToRow(e: Entry, owner: string): EntryRow {
  return {
    id: e.id,
    owner_user_id: owner,
    place_id: e.placeId,
    visit_date: e.visitDate,
    rating: e.rating ?? null,
    budget: e.budget ?? null,
    transcript: e.transcript ?? null,
    note_private: e.notePrivate ?? null,
    note_public: e.notePublic ?? null,
    summary: e.summary ?? null,
    cover_media_id: e.coverMediaId ?? null,
    is_private: !!e.isPrivate,
    client_id: e.id,
    revision: e.revision ?? 1,
    updated_at: e.updatedAt,
  }
}

/** entry_tags 关系存于独立表，回填 tagIds（与 Web pullRemote 保留本地标签口径一致）。 */
export function entryFromRow(r: EntryRow, tagIds: string[] = []): Entry {
  return {
    id: r.id,
    placeId: r.place_id,
    visitDate: r.visit_date,
    rating: r.rating ?? undefined,
    budget: r.budget ?? undefined,
    transcript: r.transcript ?? undefined,
    notePrivate: r.note_private ?? undefined,
    notePublic: r.note_public ?? undefined,
    summary: r.summary ?? undefined,
    coverMediaId: r.cover_media_id ?? undefined,
    tagIds: [...tagIds],
    isPrivate: r.is_private,
    revision: r.revision,
    baseRevision: r.revision,
    sync: 'synced',
    createdAt: r.created_at ?? '',
    updatedAt: r.updated_at ?? '',
  }
}

// ── tag_dimensions ─────────────────────────────────────────────────────────

export function dimensionToRow(d: Dimension, owner: string): TagDimensionRow {
  return {
    id: d.id,
    owner_user_id: owner,
    name: d.name,
    kind: d.kind,
    sort_order: d.sortOrder,
    revision: d.revision ?? 1,
  }
}

export function dimensionFromRow(r: TagDimensionRow): Dimension {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    sortOrder: r.sort_order,
    revision: r.revision,
    baseRevision: r.revision,
  }
}

// ── tags ───────────────────────────────────────────────────────────────────

export function tagToRow(t: Tag, owner: string): TagRow {
  return {
    id: t.id,
    owner_user_id: owner,
    dimension_id: t.dimensionId,
    parent_id: t.parentId ?? null,
    name: t.name,
    alias: t.alias ?? null,
    sort_order: t.sortOrder,
    revision: t.revision ?? 1,
  }
}

export function tagFromRow(r: TagRow): Tag {
  return {
    id: r.id,
    dimensionId: r.dimension_id,
    parentId: r.parent_id,
    name: r.name,
    alias: r.alias ?? undefined,
    sortOrder: r.sort_order,
    revision: r.revision,
    baseRevision: r.revision,
  }
}

// ── media（辅助对象，无 revision；幂等键 owner_user_id,client_id）────────────

/** 仅当已拿到远端对象路径后才可入库（upload_media 成功后调用）。 */
export function mediaToRow(m: MediaItem, owner: string): MediaRow {
  if (!m.remotePath) throw new Error('mediaToRow 需要 remotePath（上传成功后才有云端行）')
  return {
    id: m.id,
    owner_user_id: owner,
    entry_id: m.entryId,
    place_id: m.placeId,
    storage_path: m.remotePath,
    thumb_path: m.remoteThumbPath ?? null,
    width: m.width ?? null,
    height: m.height ?? null,
    bytes: m.bytes ?? null,
    taken_at: m.takenAt ?? null,
    sort_order: m.order,
    client_id: m.id,
  }
}

export function mediaFromRow(r: MediaRow): MediaItem {
  return {
    id: r.id,
    entryId: r.entry_id,
    placeId: r.place_id,
    order: r.sort_order,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    bytes: r.bytes ?? undefined,
    takenAt: r.taken_at ?? undefined,
    remotePath: r.storage_path,
    remoteThumbPath: r.thumb_path ?? undefined,
    sync: 'synced',
  }
}

// ── share_snapshots / share_items ──────────────────────────────────────────

export function shareSnapshotToRow(s: ShareSnapshot, owner: string): ShareSnapshotRow {
  return {
    id: s.id,
    owner_user_id: owner,
    slug: s.slug,
    kind: s.kind,
    title: s.title,
    owner_display_name: s.ownerName ?? null,
    payload: { title: s.title, owner_display_name: s.ownerName ?? null, created_at: s.createdAt },
    status: s.status,
    client_id: s.id,
    created_at: s.createdAt,
  }
}

/** 白名单 mapper：只允许 §shareItemPayload 的 7 个基础字段，私密字段一律剔除。 */
export function shareItemToPayload(it: ShareItem): ShareWhitelistPayload {
  return {
    name: it.placeName,
    area: it.area ?? null,
    rating: it.rating ?? null,
    budget: it.budget ?? null,
    note_public: it.reason ?? null,
    tags: it.tags ?? [],
    // 与 Web 一致：hidden 之外一律按 approx 输出，绝不外泄精确坐标数值。
    coord_precision: it.coordHidden ? 'hidden' : 'approx',
  }
}

/** share_items 行：白名单 payload + 公开桶封面 URL（cover_url 可为 null）。 */
export function shareItemToRow(
  s: ShareSnapshot,
  it: ShareItem,
  owner: string,
  sortOrder: number,
  coverUrl: string | null,
): ShareItemRow {
  const base = shareItemToPayload(it)
  const item: ShareItemPayload = { ...base, cover_url: coverUrl }
  return {
    snapshot_id: s.id,
    owner_user_id: owner,
    sort_order: sortOrder,
    item,
    client_id: it.clientId,
  }
}

/** 坐标精度归一：Web 未显式设置时按 exact 处理（`src/lib/shares.ts`）。 */
export function placeCoordPrecision(p: Place): CoordPrecision {
  return p.coordPrecision ?? 'exact'
}

// ── public_share_read RPC 结果 → 本地快照 ───────────────────────────────────

/** 匿名/公开读取映射；kind 不匹配或快照缺失返回 null（与 Web fetchCloudShare 同口径）。 */
export function publicShareToSnapshot(
  result: PublicShareReadResult,
  expectedKind?: ShareSnapshot['kind'],
): ShareSnapshot | null {
  const s = result.snapshot
  if (!s) return null
  if (expectedKind && s.kind !== expectedKind) return null
  return {
    id: s.id,
    slug: s.slug,
    kind: s.kind,
    title: s.title,
    ownerName: s.owner_display_name ?? '',
    items: (result.items ?? []).map((raw) => {
      const i = raw.item
      return {
        clientId: '',
        placeName: i.name,
        area: i.area ?? undefined,
        rating: i.rating ?? undefined,
        budget: i.budget != null ? Number(i.budget) : undefined,
        reason: i.note_public ?? undefined,
        tags: i.tags ?? undefined,
        coverUri: i.cover_url ?? undefined,
        coordHidden: i.coord_precision === 'hidden',
      }
    }),
    status: 'active',
    createdAt: s.created_at,
  }
}
