// 真网 PushTransport（TASK-DEV-08；SDD 真接线段 / T063–T067 合同）。
//
// 把 outbox 逻辑 op 映射成云端行并写入 Supabase（PostgREST + Storage）：
//   - 核心实体（places/entries/tag_dimensions/tags）：首推 INSERT，后续
//     `id + revision = base_revision` 条件 UPDATE；0 行 → 落冲突（本地行标 conflict）且
//     当作本 op 完成（不无限重试），对齐 Web `pushEntity` + `registerConflict`；
//   - upsert_entry：推送 entry 后做 entry_tags 差量（先增后删，`onConflict 'entry_id,tag_id'`）；
//   - upsert_tags：维度先于标签、父先于子，逐行乐观锁推送；
//   - upload_media：display/thumb 双路径，base64→ArrayBuffer 上传私有桶；任一步失败
//     删除本轮已传对象、保留本地文件、不标 synced；成功才落 media 行（`onConflict
//     'owner_user_id,client_id'`）并回填 remote_path/thumb_path；
//   - delete_place/delete_entry/delete_tags：行不存在=目的达成（网关 0 行不报错）；
//   - create_share/revoke_share：快照/分享项受控 upsert，item 走白名单 mapper。
//
// 本文件不 import supabase-js/Expo：真客户端经 `SyncGateway` 注入，单测用录制型 fake。

import type { SqlDatabase } from '../db/database'
import { TABLE_COLUMNS, type CoreEntityTable } from '../db/schema'
import { shareItemToPayload } from '../domain/mapping'
import {
  PRIVATE_MEDIA_BUCKET,
  SHARE_MEDIA_BUCKET,
  privateDisplayPath,
  privateThumbPath,
  shareCoverPath,
  type ShareItem,
} from '../domain/types'
import { base64ToArrayBuffer } from './base64'
import { addConflictRecord, type ConflictEntityKind } from './conflicts'
import { eqFilter, inFilter, isUniqueViolation, type SyncGateway } from './gateway'
import type { PushOpPayload, PushTransport, TransportResult } from './transport'

type Row = Record<string, unknown>

const CORE_TABLE_KIND: Record<CoreEntityTable, ConflictEntityKind> = {
  places: 'place',
  entries: 'entry',
  tag_dimensions: 'dimension',
  tags: 'tag',
}

/** 本地文件读取（生产为 expo-file-system 的 `File.base64()`；测试注入内存/桩实现）。 */
export interface MediaFileReader {
  readBase64(uri: string): Promise<string>
}

export interface SupabaseTransportDeps {
  db: SqlDatabase
  gateway: SyncGateway
  /** 云端归属（= 会话 `auth.uid()`；owner 门禁由 dispatcher 先行保证）。 */
  owner: string
  /** media 上传需要；无文件可传的 op 可不提供。 */
  mediaFiles?: MediaFileReader
  now?: () => number
}

function toBool(value: unknown): boolean {
  return value === true || value === 1
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
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

// ── 本地行 → 云端线合同行（只取云列白名单，显式补 owner/client_id）─────────────

function placeCloudRow(row: Row, owner: string): Row {
  return {
    id: row.id,
    owner_user_id: owner,
    name: row.name,
    area: row.area ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    coord_precision: row.coord_precision ?? 'exact',
    is_private: toBool(row.is_private),
    client_id: row.id,
    revision: row.revision ?? 1,
    updated_at: row.updated_at ?? undefined,
  }
}

function entryCloudRow(row: Row, owner: string): Row {
  return {
    id: row.id,
    owner_user_id: owner,
    place_id: row.place_id,
    visit_date: row.visit_date,
    rating: row.rating ?? null,
    budget: row.budget ?? null,
    transcript: row.transcript ?? null,
    note_private: row.note_private ?? null,
    note_public: row.note_public ?? null,
    summary: row.summary ?? null,
    cover_media_id: row.cover_media_id ?? null,
    is_private: toBool(row.is_private),
    client_id: row.id,
    revision: row.revision ?? 1,
    updated_at: row.updated_at ?? undefined,
  }
}

function dimensionCloudRow(row: Row, owner: string): Row {
  return {
    id: row.id,
    owner_user_id: owner,
    name: row.name,
    kind: row.kind,
    sort_order: row.sort_order ?? 0,
    revision: row.revision ?? 1,
  }
}

function tagCloudRow(row: Row, owner: string): Row {
  return {
    id: row.id,
    owner_user_id: owner,
    dimension_id: row.dimension_id,
    parent_id: row.parent_id ?? null,
    name: row.name,
    alias: row.alias ?? null,
    sort_order: row.sort_order ?? 0,
    revision: row.revision ?? 1,
  }
}

function mediaCloudRow(row: Row, owner: string, storagePath: string, thumbPath: string | null): Row {
  return {
    id: row.id,
    owner_user_id: owner,
    entry_id: row.entry_id,
    place_id: row.place_id,
    storage_path: storagePath,
    thumb_path: thumbPath,
    width: row.width ?? null,
    height: row.height ?? null,
    bytes: row.bytes ?? null,
    taken_at: row.taken_at ?? null,
    sort_order: row.sort_order ?? 0,
    client_id: row.id,
  }
}

export function createSupabaseTransport(deps: SupabaseTransportDeps): PushTransport {
  const { db, gateway, owner } = deps
  const now = deps.now ?? (() => Date.now())
  const ts = () => new Date(now()).toISOString()

  function readRow(table: string, id: string): Row | null {
    return db.getFirstSync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id)
  }

  function markSynced(table: CoreEntityTable, id: string, revision: number): void {
    const clearError = TABLE_COLUMNS[table].includes('sync_error') ? ', sync_error = NULL' : ''
    db.runSync(
      `UPDATE ${table} SET revision = ?, base_revision = ?, sync_status = 'synced'${clearError}, updated_at = ? WHERE id = ?`,
      revision,
      revision,
      ts(),
      id,
    )
  }

  function markLocalConflict(table: CoreEntityTable, id: string): void {
    db.runSync(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?`, id)
  }

  async function fetchRemoteRow(table: string, id: string): Promise<Row | null> {
    const res = await gateway.select(table, { columns: '*', filters: [eqFilter('id', id)] })
    if (res.error) throw new Error(res.error.message)
    return res.data?.[0] ?? null
  }

  function throwIfError(error: { message: string } | null, context: string): void {
    if (error) throw new Error(`${context}: ${error.message}`)
  }

  /**
   * 核心实体推送：首推 INSERT，后续 expected-revision 条件 UPDATE。
   * 0 行 → 登记冲突 + 本地标 conflict，op 视为完成（不重试）。
   */
  async function pushCoreEntity(table: CoreEntityTable, id: string): Promise<void> {
    const local = readRow(table, id)
    if (!local) return
    const build = CORE_TABLE_KIND[table]
    const cloudRow =
      table === 'places'
        ? placeCloudRow(local, owner)
        : table === 'entries'
          ? entryCloudRow(local, owner)
          : table === 'tag_dimensions'
            ? dimensionCloudRow(local, owner)
            : tagCloudRow(local, owner)

    const baseRaw = local.base_revision
    let expected: number | null = typeof baseRaw === 'number' ? baseRaw : null

    if (expected == null) {
      const inserted = await gateway.insert(table, cloudRow)
      if (!inserted.error) {
        const revision = toNumberOrNull(inserted.data?.[0]?.revision) ?? toNumberOrNull(cloudRow.revision) ?? 1
        markSynced(table, id, revision)
        return
      }
      // 重放校准：该行此前已插入但确认丢失 → 取远端 revision 作 expected 条件更新。
      if (!isUniqueViolation(inserted.error)) throw new Error(`${table} insert: ${inserted.error.message}`)
      const remote = await fetchRemoteRow(table, id)
      expected = remote ? toNumberOrNull(remote.revision) : null
      if (expected == null) throw new Error(`${table} insert: ${inserted.error.message}`)
    }

    const updated = await gateway.updateIfRevision(table, id, cloudRow, expected)
    throwIfError(updated.error, `${table} update`)
    const rows = updated.data ?? []
    if (rows.length === 0) {
      const remote = await fetchRemoteRow(table, id)
      addConflictRecord(db, {
        entityId: id,
        entityKind: build,
        expectedRevision: expected,
        localSnapshot: local,
        remoteSnapshot: remote ?? undefined,
        now: ts(),
      })
      markLocalConflict(table, id)
      return
    }
    const revision = toNumberOrNull(rows[0]?.revision) ?? toNumberOrNull(cloudRow.revision) ?? expected
    markSynced(table, id, revision)
  }

  /** entry_tags 差量：先增后删（对齐 Web，`onConflict 'entry_id,tag_id'`）。 */
  async function syncEntryTags(entryId: string): Promise<void> {
    const desired = db
      .getAllSync<{ tag_id: string }>('SELECT tag_id FROM entry_tags WHERE entry_id = ?', entryId)
      .map((r) => r.tag_id)
    const remote = await gateway.select('entry_tags', {
      columns: 'id, tag_id',
      filters: [eqFilter('entry_id', entryId)],
    })
    throwIfError(remote.error, 'entry_tags select')
    const remoteRows = remote.data ?? []
    const remoteIds = new Set(remoteRows.map((r) => String(r.tag_id)))
    const desiredSet = new Set(desired)
    const toAdd = desired.filter((tagId) => !remoteIds.has(tagId))
    const staleIds = remoteRows.filter((r) => !desiredSet.has(String(r.tag_id))).map((r) => String(r.id))

    if (toAdd.length > 0) {
      const up = await gateway.upsert(
        'entry_tags',
        toAdd.map((tagId) => ({ entry_id: entryId, tag_id: tagId, owner_user_id: owner })),
        'entry_id,tag_id',
      )
      throwIfError(up.error, 'entry_tags upsert')
    }
    if (staleIds.length > 0) {
      const del = await gateway.remove('entry_tags', [inFilter('id', staleIds)])
      throwIfError(del.error, 'entry_tags delete')
    }
  }

  async function pushTags(op: PushOpPayload): Promise<void> {
    const allTags = db.getAllSync<Row>('SELECT * FROM tags')
    const byId = new Map(allTags.map((t) => [String(t.id), t]))
    const explicit = op.entityIds?.length ? [...op.entityIds] : op.entityId ? [op.entityId] : null

    let tags: Row[]
    let dimensionIds: string[]
    if (explicit) {
      const seen = new Set<string>()
      const chain: Row[] = []
      for (const id of explicit) {
        let current = byId.get(id)
        while (current && !seen.has(String(current.id))) {
          seen.add(String(current.id))
          chain.push(current)
          current = current.parent_id ? byId.get(String(current.parent_id)) : undefined
        }
      }
      tags = chain
      dimensionIds = [...new Set(chain.map((t) => String(t.dimension_id)))]
    } else {
      tags = allTags
      dimensionIds = db.getAllSync<{ id: string }>('SELECT id FROM tag_dimensions').map((r) => r.id)
    }

    const tagById = new Map(tags.map((t) => [String(t.id), t]))
    const depthOf = (tag: Row): number => {
      let depth = 0
      let current = tag
      while (current.parent_id) {
        const parent = tagById.get(String(current.parent_id))
        if (!parent) break
        depth += 1
        current = parent
      }
      return depth
    }
    const orderedTags = [...tags].sort((a, b) => depthOf(a) - depthOf(b))

    for (const dimensionId of dimensionIds) await pushCoreEntity('tag_dimensions', dimensionId)
    for (const tag of orderedTags) await pushCoreEntity('tags', String(tag.id))
  }

  async function deleteTags(op: PushOpPayload): Promise<void> {
    const ids = op.entityIds ?? (op.entityId ? [op.entityId] : [])
    if (ids.length === 0) return
    const assoc = await gateway.remove('entry_tags', [
      inFilter('tag_id', ids),
      eqFilter('owner_user_id', owner),
    ])
    throwIfError(assoc.error, 'delete_tags entry_tags')
    for (const id of ids) {
      const res = await gateway.remove('tags', [eqFilter('id', id), eqFilter('owner_user_id', owner)])
      throwIfError(res.error, 'delete_tags tags')
    }
  }

  async function uploadFile(bucket: string, path: string, uri: string): Promise<void> {
    if (!deps.mediaFiles) throw new Error('缺少 media 文件读取器（MediaFileReader）')
    const base64 = await deps.mediaFiles.readBase64(uri)
    const data = base64ToArrayBuffer(base64)
    const res = await gateway.upload(bucket, path, data, { contentType: 'image/jpeg', upsert: true })
    if (res.error && !/exists/i.test(res.error.message)) throw new Error(`storage ${path}: ${res.error.message}`)
  }

  /** display/thumb 双路径上传；失败删本轮已传对象、保留本地文件、不标 synced。 */
  async function uploadMedia(op: PushOpPayload): Promise<void> {
    const id = op.entityId
    if (!id) return
    const row = readRow('media', id)
    if (!row) return
    const display = toStringOrNull(row.local_display_path)
    const thumb = toStringOrNull(row.local_thumb_path)
    if (!display && !thumb) return

    const placeId = String(row.place_id)
    const remoteDisplay = privateDisplayPath(owner, placeId, id)
    const remoteThumb = privateThumbPath(owner, placeId, id)
    const uploaded: string[] = []
    try {
      if (thumb) {
        await uploadFile(PRIVATE_MEDIA_BUCKET, remoteThumb, thumb)
        uploaded.push(remoteThumb)
      }
      if (display) {
        await uploadFile(PRIVATE_MEDIA_BUCKET, remoteDisplay, display)
        uploaded.push(remoteDisplay)
      }
      const res = await gateway.upsert(
        'media',
        mediaCloudRow(row, owner, remoteDisplay, thumb ? remoteThumb : null),
        'owner_user_id,client_id',
      )
      throwIfError(res.error, 'media upsert')
    } catch (error) {
      if (uploaded.length > 0) {
        try {
          await gateway.removeObjects(PRIVATE_MEDIA_BUCKET, uploaded)
        } catch {
          // 清理失败留待下次覆盖上传（幂等 upsert）
        }
      }
      throw error
    }

    db.runSync(
      `UPDATE media SET remote_path = ?, remote_thumb_path = ?, sync_status = 'synced', updated_at = ? WHERE id = ?`,
      display ? remoteDisplay : toStringOrNull(row.remote_path),
      thumb ? remoteThumb : toStringOrNull(row.remote_thumb_path),
      ts(),
      id,
    )
  }

  function shareSnapshotCloudRow(row: Row, ownerUserId: string): Row {
    return {
      id: row.id,
      owner_user_id: ownerUserId,
      slug: row.slug,
      kind: row.kind,
      title: row.title,
      owner_display_name: row.owner_name ?? null,
      payload: { title: row.title, owner_display_name: row.owner_name ?? null, created_at: row.created_at },
      status: row.status,
      client_id: row.id,
      created_at: row.created_at,
    }
  }

  function shareItemCloudRow(row: Row, ownerUserId: string, snapshotId: string, sortOrder: number, coverUrl: string | null): Row {
    const item: ShareItem = {
      clientId: String(row.client_id),
      entryId: toStringOrNull(row.entry_id) ?? undefined,
      coverMediaId: toStringOrNull(row.cover_media_id) ?? undefined,
      placeName: String(row.place_name),
      area: toStringOrNull(row.area) ?? undefined,
      rating: toNumberOrNull(row.rating) ?? undefined,
      budget: toNumberOrNull(row.budget) ?? undefined,
      reason: toStringOrNull(row.reason) ?? undefined,
      tags: parseStringArray(row.tags_json),
      coverUri: toStringOrNull(row.cover_uri) ?? undefined,
      lat: toNumberOrNull(row.lat) ?? undefined,
      lng: toNumberOrNull(row.lng) ?? undefined,
      coordHidden: row.coord_hidden === 1,
    }
    const payload = { ...shareItemToPayload(item), cover_url: coverUrl }
    return {
      snapshot_id: snapshotId,
      owner_user_id: ownerUserId,
      sort_order: sortOrder,
      item: payload,
      client_id: item.clientId,
    }
  }

  async function createShare(op: PushOpPayload): Promise<void> {
    const snapshotId = op.entityId
    if (!snapshotId) return
    const snapshot = readRow('share_snapshots', snapshotId)
    if (!snapshot || snapshot.status !== 'active') return

    const items = db.getAllSync<Row>(
      'SELECT * FROM share_items WHERE snapshot_id = ? ORDER BY sort_order ASC',
      snapshotId,
    )
    const mediaById = new Map(
      db.getAllSync<Row>('SELECT * FROM media').map((m) => [String(m.id), m]),
    )

    // 封面缩略图上传「尽力而为」：失败保持 cover_url=null，快照照常上云。
    const coverUrls = new Map<string, string>()
    for (const item of items) {
      const coverMediaId = toStringOrNull(item.cover_media_id)
      if (!coverMediaId) continue
      const media = mediaById.get(coverMediaId)
      const thumb = media ? toStringOrNull(media.local_thumb_path) : null
      if (!thumb) continue
      const path = shareCoverPath(owner, snapshotId, String(item.client_id))
      try {
        await uploadFile(SHARE_MEDIA_BUCKET, path, thumb)
        const url = gateway.publicUrl(SHARE_MEDIA_BUCKET, path)
        if (url) coverUrls.set(String(item.client_id), url)
      } catch {
        // 公开桶不可用时不拦快照上云
      }
    }

    const snapshotRes = await gateway.upsert('share_snapshots', shareSnapshotCloudRow(snapshot, owner), 'owner_user_id,client_id')
    throwIfError(snapshotRes.error, 'share_snapshots upsert')

    const itemRows = items.map((item, index) =>
      shareItemCloudRow(item, owner, snapshotId, index, coverUrls.get(String(item.client_id)) ?? null),
    )
    const existing = await gateway.select('share_items', {
      columns: 'id, client_id',
      filters: [eqFilter('snapshot_id', snapshotId)],
    })
    throwIfError(existing.error, 'share_items select')
    const localKeys = new Set(itemRows.map((r) => String(r.client_id)))
    const staleIds = (existing.data ?? [])
      .filter((r) => !localKeys.has(String(r.client_id)))
      .map((r) => String(r.id))

    if (itemRows.length > 0) {
      const up = await gateway.upsert('share_items', itemRows, 'snapshot_id,client_id')
      throwIfError(up.error, 'share_items upsert')
    }
    if (staleIds.length > 0) {
      const del = await gateway.remove('share_items', [inFilter('id', staleIds)])
      throwIfError(del.error, 'share_items delete')
    }
  }

  async function deleteOwnedRow(table: string, id: string | undefined): Promise<void> {
    if (!id) return
    const res = await gateway.remove(table, [eqFilter('id', id), eqFilter('owner_user_id', owner)])
    throwIfError(res.error, `delete ${table}`)
  }

  return {
    async send(op: PushOpPayload): Promise<TransportResult> {
      try {
        switch (op.kind) {
          case 'upsert_place':
            await pushCoreEntity('places', op.entityId ?? '')
            return { outcome: 'ok' }
          case 'upsert_entry': {
            if (!op.entityId) return { outcome: 'ok' }
            await pushCoreEntity('entries', op.entityId)
            await syncEntryTags(op.entityId)
            return { outcome: 'ok' }
          }
          case 'upsert_tags':
            await pushTags(op)
            return { outcome: 'ok' }
          case 'delete_tags':
            await deleteTags(op)
            return { outcome: 'ok' }
          case 'upload_media':
            await uploadMedia(op)
            return { outcome: 'ok' }
          case 'create_share':
            await createShare(op)
            return { outcome: 'ok' }
          case 'revoke_share': {
            if (!op.entityId) return { outcome: 'ok' }
            const res = await gateway.update(
              'share_snapshots',
              { status: 'revoked' },
              [eqFilter('slug', op.entityId), eqFilter('owner_user_id', owner)],
            )
            throwIfError(res.error, 'revoke_share')
            return { outcome: 'ok' }
          }
          case 'delete_place':
            await deleteOwnedRow('places', op.entityId)
            return { outcome: 'ok' }
          case 'delete_entry':
            await deleteOwnedRow('entries', op.entityId)
            return { outcome: 'ok' }
          default:
            return { outcome: 'retry', error: `不支持的 op kind: ${String(op.kind)}` }
        }
      } catch (error) {
        return { outcome: 'retry', error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
