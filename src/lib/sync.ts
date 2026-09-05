// 同步引擎：本地 outbox → Supabase。
// V1.1 协议（响应数据库管理员审查意见 §5/§6/§11）：
//   - 实体行：本地 baseRevision 为空 → INSERT；非空 → 条件更新
//     （.eq('revision', baseRevision)）；0 行 = 并发冲突，进入用户显式裁决，
//     绝不静默覆盖。服务端触发器强制 revision 单调 +1、owner 不可变。
//   - client_id 幂等：unique (owner_user_id, client_id)；share_items 走
//     unique (snapshot_id, client_id)，重试不产生重复行。
//   - pullRemote：仅「本机该行无未确认写入（sync === 'synced'）」时按
//     revision/updated_at 刷新；冲突行（conflict）与未确认行一律不覆盖。
import { repo, outboxAll, outboxRemove, outboxFail, enqueue, getMeta, setMeta, bulkPut } from './idb'
import { cloudConfigured } from './env'
import { supabase, currentUserId, getSession, table, DB_SCHEMA } from './supabase'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Place, Entry, MediaItem, Dimension, Tag, ShareSnapshot, SyncStatus } from './types'

export type CloudState = 'unconfigured' | 'offline' | 'signed-out' | 'syncing' | 'idle' | 'error'
export let lastSyncError = ''

const remoteUrlCache = new Map<string, string>()
export function remoteMediaUrl(mediaId?: string): string | undefined {
  return mediaId ? remoteUrlCache.get(mediaId) : undefined
}

export async function cloudState(): Promise<CloudState> {
  if (!cloudConfigured()) return 'unconfigured'
  if (!navigator.onLine) return 'offline'
  const s = await getSession()
  return s ? 'idle' : 'signed-out'
}

// ── 冲突记录（meta 'conflicts'）：0 行条件更新 → 用户裁决 ────────────────────
export interface ConflictRecord {
  id: string
  kind: 'place' | 'entry' | 'tag' | 'dimension'
  expected: number              // 提交时携带、但云端已不匹配的 baseRevision
  remote: any | null            // 冲突时云端当前行（null = 云端已删除）
  at: string
}
async function getConflicts(): Promise<ConflictRecord[]> {
  return (await getMeta<ConflictRecord[]>('conflicts')) ?? []
}
async function putConflicts(list: ConflictRecord[]) {
  await setMeta('conflicts', list)
}
export async function listConflicts(): Promise<ConflictRecord[]> {
  return getConflicts()
}

// 规范（V1.2 §5.1）：归属字段固定 owner_user_id；§5.2：核心实体带 revision 并以记录级写入
function placeRow(p: Place, owner: string) {
  return { id: p.id, owner_user_id: owner, name: p.name, area: p.area ?? null, lat: p.lat ?? null, lng: p.lng ?? null,
    coord_precision: p.coordPrecision ?? 'exact', is_private: !!p.isPrivate, client_id: p.id,
    revision: p.revision ?? 1, updated_at: p.updatedAt }
}
function entryRow(e: Entry, owner: string) {
  return { id: e.id, owner_user_id: owner, place_id: e.placeId, visit_date: e.visitDate, rating: e.rating ?? null,
    budget: e.budget ?? null, transcript: e.transcript ?? null, note_private: e.notePrivate ?? null,
    note_public: e.notePublic ?? null, summary: e.summary ?? null, cover_media_id: e.coverMediaId ?? null,
    is_private: !!e.isPrivate, client_id: e.id, revision: e.revision ?? 1, updated_at: e.updatedAt }
}
function dimRow(d: Dimension, owner: string) {
  return { id: d.id, owner_user_id: owner, name: d.name, kind: d.kind, sort_order: d.sortOrder, revision: d.revision ?? 1 }
}
function tagRow(t: Tag, owner: string) {
  return { id: t.id, owner_user_id: owner, dimension_id: t.dimensionId, parent_id: t.parentId ?? null, name: t.name, alias: t.alias ?? null, sort_order: t.sortOrder, revision: t.revision ?? 1 }
}
function shareItemPayload(s: ShareSnapshot, it: ShareSnapshot['items'][number]) {
  // 分享白名单（与 0001_init.sql 的 share_payload_whitelist 触发器一致）：
  // 只包含 name/area/cover_url/rating/budget/note_public/tags/visit_date/coord_precision。
  // note_private、transcript、坐标数值（lat/lng）等一律不入云端 payload。
  return {
    name: it.placeName,
    area: it.area ?? null,
    rating: it.rating ?? null,
    budget: it.budget ?? null,
    note_public: it.reason ?? null,
    tags: it.tags ?? [],
    coord_precision: it.coordHidden ? 'hidden' : 'approx',
  }
}

type EntityName = 'places' | 'entries' | 'tags' | 'tag_dimensions'
type PushResult = { ok: true; revision: number } | { ok: false; conflict?: any | null; error?: string }

// 单行推送：INSERT（首次）或条件更新（乐观锁）。返回新 revision 或冲突（含云端当前行）。
async function pushEntity(sb: SupabaseClient, name: EntityName, row: any, baseRevision?: number): Promise<PushResult> {
  if (baseRevision == null) {
    const { error } = await table(sb, name).insert(row)
    if (!error) return { ok: true, revision: 1 }
    // 重放场景：该行此前已插入成功但 outbox 确认丢失 → 内容来自同一设备，
    // 取远端 revision 作 expected 做条件更新校准（见 V1.1 方案 §7 幂等说明）。
    const code = (error as any)?.code
    if (code !== '23505' && !/duplicate key|unique/i.test(error.message)) return { ok: false, error: error.message }
  }
  const expected = baseRevision ?? (await fetchRemoteRow(sb, name, row.id))?.revision
  if (expected == null) return { ok: false, error: '无法确定 expected revision' }
  const { data, error: e2 } = await table(sb, name).update(row).eq('id', row.id).eq('revision', expected).select('revision')
  if (e2) return { ok: false, error: e2.message }
  if (!data?.length) {
    const remote = await fetchRemoteRow(sb, name, row.id)
    return { ok: false, conflict: remote, error: 'revision-conflict' }
  }
  return { ok: true, revision: data[0].revision as number }
}

async function fetchRemoteRow(sb: SupabaseClient, name: EntityName, id: string): Promise<any | null> {
  const { data } = await table(sb, name).select('*').eq('id', id).maybeSingle()
  return data ?? null
}

type ConflictStore = 'places' | 'entries' | 'dimensions' | 'tags'
// 冲突登记：本地行标为 conflict（内容原样保留，绝不丢失），远端行存入 meta。
async function registerConflict(kind: ConflictRecord['kind'], id: string, expected: number | undefined, remote: any | null, localRow: any | null, storeName: ConflictStore) {
  const list = await getConflicts()
  const rec: ConflictRecord = { id, kind, expected: expected ?? 1, remote, at: new Date().toISOString() }
  const others = list.filter((c) => c.id !== id)
  await putConflicts([...others, rec])
  if (localRow) { localRow.sync = 'conflict' as SyncStatus; await bulkPut(storeName, [localRow]) }
}

// 确保引用的标签/维度已在云端：演示数据（seed）从未上云时，entry_tags 的
// 外键（entry_tags_tag_fk）会拦掉整次推送，导致远端 rescue 永远为空、
// pullRemote 覆盖后本地标签丢失。在 entry_tags 差量前补推缺失行。
async function ensureTagsInCloud(sb: SupabaseClient, owner: string, neededTagIds: string[]): Promise<void> {
  if (!neededTagIds.length) return
  const dims = await repo.dimensions()
  const tags = await repo.tags()
  // 递归展开父标签链（QA T2-B）：FK tags_parent_owner_fk 要求父行先存在，
  // 只推叶子会导致「含父链的标签」同步失败。收集后 reverse 保证父先于叶推送。
  const byId = new Map(tags.map((t) => [t.id, t]))
  const chain: Tag[] = []
  const seen = new Set<string>()
  for (const id of neededTagIds) {
    let cur: Tag | undefined = byId.get(id)
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.push(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }
  if (!chain.length) return
  const { data: remoteRows } = await table(sb, 'tags').select('id').in('id', chain.map((t) => t.id))
  const remoteSet = new Set(((remoteRows ?? []) as { id: string }[]).map((r) => r.id))
  const missing = chain.filter((t) => !remoteSet.has(t.id)).reverse()
  if (!missing.length) return
  const needDims = new Set(missing.map((t) => t.dimensionId))
  for (const d of dims.filter((d) => needDims.has(d.id))) {
    const r = await pushEntity(sb, 'tag_dimensions', dimRow(d, owner), d.baseRevision)
    if (r.ok) await bulkPut('dimensions', [{ ...d, revision: r.revision, baseRevision: r.revision }])
    else if (r.conflict !== undefined) await registerConflict('dimension', d.id, d.baseRevision, r.conflict, { ...d }, 'dimensions')
    else throw new Error(r.error ?? 'unknown')
  }
  for (const t of missing) {
    const r = await pushEntity(sb, 'tags', tagRow(t, owner), t.baseRevision)
    if (r.ok) await bulkPut('tags', [{ ...t, revision: r.revision, baseRevision: r.revision }])
    else if (r.conflict !== undefined) await registerConflict('tag', t.id, t.baseRevision, r.conflict, { ...t }, 'tags')
    else throw new Error(r.error ?? 'unknown')
  }
}

// 确保条目归属地点已在云端（QA V0.2 ENV-2）：entries_place_owner_fk 要求 place 行
// 先存在。演示地点被选作新记录的归属时，不补推 place 会让该 entry 永远推不上去
// （报 place_owner_fk），与 ensureTagsInCloud 对称。
async function ensurePlacesInCloud(sb: SupabaseClient, owner: string, placeId: string): Promise<void> {
  const p = (await repo.places()).find((x) => x.id === placeId)
  if (!p) return
  const { data: remote } = await table(sb, 'places').select('id').eq('id', placeId)
  if (remote && remote.length) return
  const r = await pushEntity(sb, 'places', placeRow(p, owner), p.baseRevision)
  if (r.ok) await bulkPut('places', [{ ...p, revision: r.revision, baseRevision: r.revision, sync: 'synced' as const, syncError: undefined }])
  else if (r.conflict !== undefined) await registerConflict('place', p.id, p.baseRevision, r.conflict, { ...p }, 'places')
  else throw new Error(r.error ?? 'unknown')
}

// 自愈清扫（QA V0.2 ENV-2 后续）：硬失败等曾把行留在 sync='local'/'failed' 且已不在
// outbox 的状态——这些行会永远失去同步机会。每轮同步前把「本地脏但不在队列」的行
// 重新入队；upsert_entry 分支内的 ensurePlacesInCloud 会顺带补推缺失的归属地点。
async function sweepDirtyRows(): Promise<void> {
  const queued = new Set((await outboxAll()).map((r) => (r.op.kind === 'upsert_tags' ? 'upsert_tags:' : r.op.kind === 'delete_tags' ? `delete_tags:${r.op.ids.join(',')}` : `${r.op.kind}:${r.op.id}`)))
  const allEntries = await repo.entries()
  for (const p of await repo.places()) {
    // 防复发（2026-09-05 云端大扫除）：纯演示地点不上云（demo 行 sync='local' 会被本函数反复捞起重推，
    // 历轮 QA 的万绿园×4 等僵尸即此通道产生）。仅当存在真实（非 demo）记录引用时才放行
    // ——此时 upsert_entry 分支的 ensurePlacesInCloud 本来也会补推，与该设计对称。
    if (p.demo && !allEntries.some((e) => e.placeId === p.id && !e.demo)) continue
    if ((p.sync === 'local' || p.sync === 'failed') && !queued.has(`upsert_place:${p.id}`)) await enqueue({ kind: 'upsert_place', id: p.id })
  }
  for (const e of allEntries) {
    if (e.demo) continue // 演示记录永不上云（demo 播种只写本地，不走 outbox；sweep 是唯一泄漏通道）
    if ((e.sync === 'local' || e.sync === 'failed') && !queued.has(`upsert_entry:${e.id}`)) await enqueue({ kind: 'upsert_entry', id: e.id })
  }
}

export async function syncOnce(): Promise<{ done: number; failed: number }> {
  if (!cloudConfigured() || !(await getSession())) return { done: 0, failed: 0 }
  const owner = await currentUserId()
  const sb = supabase()
  await sweepDirtyRows()
  const rows = (await outboxAll()).sort((a, b) => (a.seq! - b.seq!))
  let done = 0, failed = 0
  lastSyncError = ''

  for (const row of rows) {
    try {
      const op = row.op
      if (op.kind === 'upsert_place') {
        const p = (await repo.places()).find((x) => x.id === op.id)
        if (p) {
          const r = await pushEntity(sb, 'places', placeRow(p, owner), p.baseRevision)
          if (!r.ok) {
            if (r.conflict !== undefined) { await registerConflict('place', p.id, p.baseRevision, r.conflict, { ...p }, 'places'); await outboxRemove(row.seq!); done++; continue }
            throw new Error(r.error)
          }
          await bulkPut('places', [{ ...p, revision: r.revision, baseRevision: r.revision, sync: 'synced' as const, syncError: undefined }])
        }
      } else if (op.kind === 'upsert_entry') {
        const e = (await repo.entries()).find((x) => x.id === op.id)
        if (e) {
          // QA V0.2 ENV-2：归属地点缺失时先补推 place，否则 entries_place_owner_fk 拦死
          await ensurePlacesInCloud(sb, owner, e.placeId)
          // QA V0.2 ENV-1 连带：封面 media 未上云（如 Storage bucket 未创建）时
          // entries_cover_owner_fk 会拦掉整条 entry。此时先置空「云端封面」推送
          // （本地封面不动，绝不丢数据），待 upload_media 成功后回填（见该分支）。
          const entryPayload = entryRow(e, owner)
          if (entryPayload.cover_media_id) {
            const { data: coverRow } = await table(sb, 'media').select('id').eq('id', entryPayload.cover_media_id)
            if (!coverRow?.length) entryPayload.cover_media_id = null
          }
          const r = await pushEntity(sb, 'entries', entryPayload, e.baseRevision)
          if (!r.ok) {
            if (r.conflict !== undefined) { await registerConflict('entry', e.id, e.baseRevision, r.conflict, { ...e }, 'entries'); await outboxRemove(row.seq!); done++; continue }
            throw new Error(r.error)
          }
          await bulkPut('entries', [{ ...e, revision: r.revision, baseRevision: r.revision, sync: 'synced' as const, syncError: undefined }])
          // 规范（V1.2 §5.2）：标签关系变化「先新增、后删除」，中断不丢关系
          await ensureTagsInCloud(sb, owner, e.tagIds)
          const remoteIds = new Set(
            (await table(sb, 'entry_tags').select('tag_id').eq('entry_id', e.id)).data?.map((r: any) => r.tag_id) ?? [],
          )
          const localIds = new Set(e.tagIds)
          const toAdd = e.tagIds.filter((t) => !remoteIds.has(t))
          const toDel = [...remoteIds].filter((t) => !localIds.has(t))
          if (toAdd.length) {
            const { error: e3 } = await table(sb, 'entry_tags').upsert(
              toAdd.map((t) => ({ entry_id: e.id, tag_id: t, owner_user_id: owner })),
              { onConflict: 'entry_id,tag_id' },
            )
            if (e3) throw e3
          }
          if (toDel.length) {
            const { error: e4 } = await table(sb, 'entry_tags').delete().eq('entry_id', e.id).in('tag_id', toDel)
            if (e4) throw e4
          }
        }
      } else if (op.kind === 'upsert_tags') {
        const [dims, tags] = await Promise.all([repo.dimensions(), repo.tags()])
        // 父先于子（QA 报告遗留事项 2）：子标签排在父标签前会触发 tags_parent_owner_fk
        // 失败并使整批 op 卡 outbox；按父链深度升序推送。
        const tagById = new Map(tags.map((t) => [t.id, t]))
        const depthOf = (t: Tag): number => {
          let d = 0, cur = t
          while (cur.parentId) { const p = tagById.get(cur.parentId); if (!p) break; d++; cur = p }
          return d
        }
        const orderedTags = [...tags].sort((a, b) => depthOf(a) - depthOf(b))
        // 逐行推送；冲突逐条登记（不中断其余行），仅硬错误导致本 op 失败重试
        let hardErr = ''
        for (const d of dims) {
          const r = await pushEntity(sb, 'tag_dimensions', dimRow(d, owner), d.baseRevision)
          if (r.ok) await bulkPut('dimensions', [{ ...d, revision: r.revision, baseRevision: r.revision }])
          else if (r.conflict !== undefined) await registerConflict('dimension', d.id, d.baseRevision, r.conflict, { ...d }, 'dimensions')
          else hardErr = r.error ?? 'unknown'
        }
        for (const t of orderedTags) {
          const r = await pushEntity(sb, 'tags', tagRow(t, owner), t.baseRevision)
          if (r.ok) await bulkPut('tags', [{ ...t, revision: r.revision, baseRevision: r.revision }])
          else if (r.conflict !== undefined) await registerConflict('tag', t.id, t.baseRevision, r.conflict, { ...t }, 'tags')
          else hardErr = r.error ?? 'unknown'
        }
        if (hardErr) throw new Error(hardErr)
      } else if (op.kind === 'delete_tags') {
        // 删除语义：先清 entry_tags 关联（entry_tags_tag_fk），再按「子先父后」顺序删 tags
        // （tags_parent_owner_fk 要求父删除前其子行已不存在；ids 顺序由调用方快照给定）
        const ids = op.ids ?? []
        if (ids.length) {
          const { error: eAssoc } = await table(sb, 'entry_tags').delete().in('tag_id', ids).eq('owner_user_id', owner)
          if (eAssoc) throw eAssoc
          for (const id of ids) {
            const { error } = await table(sb, 'tags').delete().eq('id', id).eq('owner_user_id', owner)
            if (error) throw error
          }
        }
      } else if (op.kind === 'upload_media') {
        const m = (await repo.media()).find((x) => x.id === op.id)
        if (m && (m.display || m.thumb)) {
          const base = `${owner}/${m.placeId}/${m.id}`
          const uploaded: string[] = []
          try {
            if (m.thumb) {
              const { error } = await sb.storage.from('habit-tracker-media-private').upload(`${base}/thumb.jpg`, m.thumb, { contentType: 'image/jpeg', upsert: true })
              if (error && !error.message.includes('exists')) throw error
              uploaded.push(`${base}/thumb.jpg`)
            }
            if (m.display) {
              const { error } = await sb.storage.from('habit-tracker-media-private').upload(`${base}/display.jpg`, m.display, { contentType: 'image/jpeg', upsert: true })
              if (error && !error.message.includes('exists')) throw error
              uploaded.push(`${base}/display.jpg`)
            }
            const { error: e2 } = await table(sb, 'media').upsert({
              id: m.id, owner_user_id: owner, entry_id: m.entryId, place_id: m.placeId,
              storage_path: `${base}/display.jpg`, thumb_path: `${base}/thumb.jpg`,
              width: m.width ?? null, height: m.height ?? null, bytes: m.bytes ?? null,
              taken_at: m.takenAt ?? null, sort_order: m.order, client_id: m.id,
            }, { onConflict: 'owner_user_id,client_id' })
            if (e2) throw e2
          } catch (err) {
            // 孤儿文件清理（审查意见 §11.6）：数据库行未写入成功时，删除已上传对象
            if (uploaded.length) {
              try { await sb.storage.from('habit-tracker-media-private').remove(uploaded) } catch { /* 清理失败则留待下次覆盖上传 */ }
            }
            throw err
          }
          await bulkPut('media', [{ ...m, remotePath: `${base}/display.jpg`, remoteThumbPath: `${base}/thumb.jpg`, sync: 'synced' as const }])
          // 封面回填（QA V0.2）：引用此 media 作封面的 entry，此前若因 media 缺席被
          // 置空云端封面，这里重新入队以恢复链接。
          for (const en of await repo.entries()) {
            if (en.coverMediaId === m.id) await enqueue({ kind: 'upsert_entry', id: en.id })
          }
        }
      } else if (op.kind === 'create_share') {
        const s = (await repo.shares()).find((x) => x.id === op.id)
        if (s && s.status === 'active') {
          // 分享缩略图上传公开桶（仅缩略图；私有原图永远只进私有桶）
          const allMedia = await repo.media()
          // 封面缩略图上传「尽力而为」（QA V0.2 ENV-1）：bucket 未创建时不应拦掉
          // 整个快照上云——分享内容本身不依赖封面文件（cover_url 可为 null，
          // bucket 建好后重新分享/再同步可补）。
          const coverUrls: Record<string, string> = {}
          for (const it of s.items) {
            if (!it.coverMediaId) continue
            const m = allMedia.find((x) => x.id === it.coverMediaId)
            if (!m?.thumb) continue
            const path = `${owner}/${s.id}/${it.clientId}.jpg`
            try {
              const { error } = await sb.storage.from('habit-tracker-media-share').upload(path, m.thumb, { contentType: 'image/jpeg', upsert: true })
              if (error && !error.message.includes('exists')) throw error
              const { data } = sb.storage.from('habit-tracker-media-share').getPublicUrl(path)
              if (data?.publicUrl) coverUrls[it.clientId] = data.publicUrl
            } catch { /* 封面上传失败：保持 cover_url=null，快照照常上云 */ }
          }
          const snapshotRow = {
            id: s.id, owner_user_id: owner, slug: s.slug, kind: s.kind, title: s.title,
            owner_display_name: s.ownerName ?? null,
            payload: { title: s.title, owner_display_name: s.ownerName ?? null, created_at: s.createdAt },
            status: s.status, client_id: s.id, created_at: s.createdAt,
          }
          const { error } = await table(sb, 'share_snapshots').upsert(snapshotRow, { onConflict: 'owner_user_id,client_id' })
          if (error) throw error
          const itemRows = s.items.map((it, i) => ({
            snapshot_id: s.id, owner_user_id: owner, sort_order: i,
            item: { ...shareItemPayload(s, it), cover_url: coverUrls[it.clientId] ?? null },
            client_id: it.clientId,
          }))
          // 稳定幂等键（审查意见 §6）：按 client_id 差量替换，先插入、后删除
          const { data: remoteItems } = await table(sb, 'share_items').select('id, client_id').eq('snapshot_id', s.id)
          const localKeys = new Set(itemRows.map((r) => r.client_id))
          const stale = (remoteItems ?? []).filter((x: any) => !localKeys.has(x.client_id)).map((x: any) => x.id)
          if (itemRows.length) {
            const { error: e2 } = await table(sb, 'share_items').upsert(itemRows, { onConflict: 'snapshot_id,client_id' })
            if (e2) throw e2
          }
          if (stale.length) {
            const { error: e3 } = await table(sb, 'share_items').delete().in('id', stale)
            if (e3) throw e3
          }
        }
      } else if (op.kind === 'revoke_share') {
        const { error } = await table(sb, 'share_snapshots')
          .update({ status: 'revoked' }).eq('slug', op.id).eq('owner_user_id', owner)
        if (error) throw error
        // 云端无此 slug = 访客本来就打不开（如快照当初因 ENV-1 未建成上云），
        // 撤销目的已达成，视为成功，op 正常出队；不再无限重试。
        // （op.id 语义 2026-09-04 修复为 slug：此前传 snapshot uuid，eq('slug') 永远 0 行，
        //  手动撤销在云端静默失效——RQA-V-02 底层根因。）
      } else if (op.kind === 'delete_place') {
        // RQA-V-03：记录删空后级联清理空地点。行不存在（从未上云/已删）= 目的已达成，正常出队。
        const { error } = await table(sb, 'places').delete().eq('id', op.id).eq('owner_user_id', owner)
        if (error) throw error
      } else if (op.kind === 'delete_entry') {
        // §0.2-10（2026-09-05）：删除记录的云端落点（owner DELETE policy 0001 已具备）。
        // 行不存在 = 目的已达成，正常出队；多记录地点删单条不再残留云端行（复活根因修复）。
        const { error } = await table(sb, 'entries').delete().eq('id', op.id).eq('owner_user_id', owner)
        if (error) throw error
      }
      await outboxRemove(row.seq!)
      done++
    } catch (err: any) {
      lastSyncError = err?.message || String(err)
      // media 上传在环境问题（如 Storage bucket 未创建，QA V0.2 ENV-1）下重试无意义：
      // 达到上限后放弃出队并标记 sync='failed'；bucket 建好后重新保存记录即可恢复上传。
      if (row.op.kind === 'upload_media' && (row.attempts ?? 0) >= 5) {
        await outboxRemove(row.seq!)
        const mediaId = row.op.kind === 'upload_media' ? row.op.id : ''
        const m = mediaId ? (await repo.media()).find((x) => x.id === mediaId) : undefined
        if (m) await bulkPut('media', [{ ...m, sync: 'failed' as const }])
      } else {
        await outboxFail(row.seq!, lastSyncError)
      }
      failed++
      if (failed >= 5) break // 连续失败则退避，避免打爆
    }
  }
  await setMeta('last_sync', new Date().toISOString())
  return { done, failed }
}

// ── 冲突裁决（审查意见 §5.2：必须让用户选择云端版本、本地版本或手动合并）────
// 采用云端：远端行覆盖本地（base 对齐远端 revision）。
// 保留本地：以远端当前 revision 作 expected 条件更新（用户已在 UI 看过云端版本）。
// 手动合并：用户在详情页编辑保存后（本地 revision 已 +1），再点「保留本地」。
export async function resolveConflict(id: string, choice: 'remote' | 'local'): Promise<{ ok: boolean; error?: string }> {
  const conflicts = await getConflicts()
  const rec = conflicts.find((c) => c.id === id)
  if (!rec) return { ok: false, error: '冲突记录不存在' }
  const sb = supabase()
  try {
    if (choice === 'remote') {
      if (!rec.remote) return { ok: false, error: '云端行已不存在，无法采用云端版本；请选择「保留本地」' }
      const mapped = mapRemoteRow(rec.kind, rec.remote)
      const store = rec.kind === 'place' ? 'places' : rec.kind === 'entry' ? 'entries' : rec.kind === 'tag' ? 'tags' : 'dimensions'
      await bulkPut(store, [mapped])
    } else {
      const expected = rec.remote?.revision
      if (expected == null) {
        // 云端行已不存在：直接 INSERT 本地内容
        const src = await loadLocalRow(rec.kind, id)
        if (src) await pushEntity(sb, kindToTable(rec.kind), src.row, undefined)
      } else {
        const src = await loadLocalRow(rec.kind, id)
        if (src) {
          const r = await pushEntity(sb, kindToTable(rec.kind), src.row, expected)
          if (!r.ok) return { ok: false, error: r.error ?? '更新失败' }
          await bulkPut(src.store, [{ ...src.entity, revision: r.revision, baseRevision: r.revision, sync: 'synced' as const }])
        }
      }
    }
    await putConflicts((await getConflicts()).filter((c) => c.id !== id))
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

function kindToTable(kind: ConflictRecord['kind']): EntityName {
  return kind === 'place' ? 'places' : kind === 'entry' ? 'entries' : kind === 'tag' ? 'tags' : 'tag_dimensions'
}
async function loadLocalRow(kind: ConflictRecord['kind'], id: string): Promise<{ row: any; entity: any; store: 'places' | 'entries' | 'tags' | 'dimensions' } | null> {
  const owner = await currentUserId()
  if (kind === 'place') { const p = (await repo.places()).find((x) => x.id === id); return p ? { row: placeRow(p, owner), entity: p, store: 'places' } : null }
  if (kind === 'entry') { const e = (await repo.entries()).find((x) => x.id === id); return e ? { row: entryRow(e, owner), entity: e, store: 'entries' } : null }
  if (kind === 'tag') { const t = (await repo.tags()).find((x) => x.id === id); return t ? { row: tagRow(t, owner), entity: t, store: 'tags' } : null }
  const d = (await repo.dimensions()).find((x) => x.id === id)
  return d ? { row: dimRow(d, owner), entity: d, store: 'dimensions' } : null
}
function mapRemoteRow(kind: ConflictRecord['kind'], r: any): any {
  if (kind === 'place') return { id: r.id, name: r.name, area: r.area ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined, coordPrecision: r.coord_precision, isPrivate: r.is_private, revision: r.revision, baseRevision: r.revision, sync: 'synced' as const, createdAt: r.created_at, updatedAt: r.updated_at }
  if (kind === 'entry') return { id: r.id, placeId: r.place_id, visitDate: r.visit_date, rating: r.rating ?? undefined, budget: r.budget ?? undefined, transcript: r.transcript ?? undefined, notePrivate: r.note_private ?? undefined, notePublic: r.note_public ?? undefined, summary: r.summary ?? undefined, coverMediaId: r.cover_media_id ?? undefined, tagIds: [] as string[], isPrivate: r.is_private, revision: r.revision, baseRevision: r.revision, sync: 'synced' as const, createdAt: r.created_at, updatedAt: r.updated_at }
  if (kind === 'tag') return { id: r.id, dimensionId: r.dimension_id, parentId: r.parent_id, name: r.name, alias: r.alias ?? undefined, sortOrder: r.sort_order ?? 0, revision: r.revision, baseRevision: r.revision, demo: false }
  return { id: r.id, name: r.name, kind: r.kind, sortOrder: r.sort_order ?? 0, revision: r.revision, baseRevision: r.revision, demo: false }
}

// 拉取云端 → 合并到本地（跨设备可见）
// 仅 sync === 'synced' 的本机行按 revision/updated_at 刷新；pending/conflict 行一律不动。
export async function pullRemote(): Promise<{ entries: number; media: number }> {
  if (!cloudConfigured() || !(await getSession())) return { entries: 0, media: 0 }
  const sb = supabase()
  const [{ data: places }, { data: entries }, { data: tags }, { data: dims }, { data: media }] = await Promise.all([
    table(sb, 'places').select('*'),
    table(sb, 'entries').select('*'),
    table(sb, 'tags').select('*'),
    table(sb, 'tag_dimensions').select('*'),
    table(sb, 'media').select('*'),
  ])
  const localPlaces = await repo.places(), localEntries = await repo.entries(), localMedia = await repo.media()
  // map 收到 existing：标签关系存于 entry_tags 关联表而非 entries 行，
  // 远端行覆盖本地时必须保留本地 tagIds（随后与远端 entry_tags 求并集），
  // 否则 entry_tags 推送曾失败过的条目会被 pull 抹掉标签（2026-09-03 修复）。
  const merge = <T extends { id: string; updatedAt?: string; sync?: SyncStatus }>(local: T[], remote: any[], map: (r: any, existing?: T) => T) => {
    for (const r of remote ?? []) {
      const idx = local.findIndex((x) => x.id === r.id)
      if (idx < 0) { local.push(map(r)); continue }
      const l = local[idx] as any
      if (l.sync && l.sync !== 'synced') continue // 未确认本机写入/冲突行不被覆盖（V1.2 §9.2.4）
      if (r.updated_at && r.updated_at > (l.updatedAt ?? '')) local[idx] = map(r, local[idx])
    }
    return local
  }
  const mergedPlaces = merge(localPlaces, places ?? [], (r) => ({
    id: r.id, name: r.name, area: r.area ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined,
    coordPrecision: r.coord_precision, isPrivate: r.is_private, revision: r.revision ?? 1, baseRevision: r.revision ?? 1,
    sync: 'synced' as const, createdAt: r.created_at, updatedAt: r.updated_at,
  }))
  const mergedEntries = merge(localEntries, entries ?? [], (r, existing) => ({
    id: r.id, placeId: r.place_id, visitDate: r.visit_date, rating: r.rating ?? undefined, budget: r.budget ?? undefined,
    transcript: r.transcript ?? undefined, notePrivate: r.note_private ?? undefined, notePublic: r.note_public ?? undefined,
    summary: r.summary ?? undefined, coverMediaId: r.cover_media_id ?? undefined,
    tagIds: existing?.tagIds ? [...existing.tagIds] : ([] as string[]),
    isPrivate: r.is_private, revision: r.revision ?? 1, baseRevision: r.revision ?? 1,
    sync: 'synced' as const, createdAt: r.created_at, updatedAt: r.updated_at,
  }))
  const mergedMedia: MediaItem[] = mergedEntries.length ? merge(localMedia, media ?? [], (r) => ({
    id: r.id, entryId: r.entry_id, placeId: r.place_id, order: r.sort_order ?? 0,
    width: r.width ?? undefined, height: r.height ?? undefined, bytes: r.bytes ?? undefined,
    takenAt: r.taken_at ?? undefined, remotePath: r.storage_path, sync: 'synced' as const,
  })) : localMedia
  // 本地 entry_tags 合并（仅已同步条目；未确认本机变更不被远端覆盖）
  const { data: entryTags } = await table(sb, 'entry_tags').select('*')
  for (const et of entryTags ?? []) {
    const e = mergedEntries.find((x) => x.id === et.entry_id)
    if (e && e.sync === 'synced' && !e.tagIds.includes(et.tag_id)) e.tagIds.push(et.tag_id)
  }
  // 标签（远端行 baseRevision 对齐云端 revision；本机有未确认写入/冲突的行不动）
  const localDims = await repo.dimensions(), localTags = await repo.tags()
  for (const r of dims ?? []) {
    const l = localDims.find((d) => d.id === r.id)
    if (!l) localDims.push({ id: r.id, name: r.name, kind: r.kind, sortOrder: r.sort_order ?? 0, revision: r.revision ?? 1, baseRevision: r.revision ?? 1 })
    else {
      const st = (l as any).sync as SyncStatus | undefined
      if ((!st || st === 'synced') && (r.revision ?? 1) > (l.baseRevision ?? l.revision ?? 0)) {
        Object.assign(l, { name: r.name, kind: r.kind, sortOrder: r.sort_order ?? 0, revision: r.revision ?? 1, baseRevision: r.revision ?? 1 })
      }
    }
  }
  for (const r of tags ?? []) {
    const l = localTags.find((t) => t.id === r.id)
    if (!l) localTags.push({ id: r.id, dimensionId: r.dimension_id, parentId: r.parent_id, name: r.name, alias: r.alias ?? undefined, sortOrder: r.sort_order ?? 0, revision: r.revision ?? 1, baseRevision: r.revision ?? 1 })
    else {
      const st = (l as any).sync as SyncStatus | undefined
      if ((!st || st === 'synced') && (r.revision ?? 1) > (l.baseRevision ?? l.revision ?? 0)) {
        Object.assign(l, { dimensionId: r.dimension_id, parentId: r.parent_id, name: r.name, alias: r.alias ?? undefined, sortOrder: r.sort_order ?? 0, revision: r.revision ?? 1, baseRevision: r.revision ?? 1 })
      }
    }
  }
  await bulkPut('places', mergedPlaces)
  await bulkPut('entries', mergedEntries)
  await bulkPut('media', mergedMedia)
  await bulkPut('dimensions', localDims)
  await bulkPut('tags', localTags)
  // 为远端缩略图生成短期签名 URL（缓存）
  const withRemote = mergedMedia.filter((m) => m.remotePath && !m.display && !m.thumb)
  for (const m of withRemote.slice(0, 200)) {
    const { data } = await supabase().storage.from('habit-tracker-media-private').createSignedUrl(m.remotePath!, 3600)
    if (data) remoteUrlCache.set(m.id, data.signedUrl)
  }
  return { entries: mergedEntries.length, media: mergedMedia.length }
}

export async function autoSync() {
  const st = await cloudState()
  if (st !== 'idle') return
  const busy = await getMeta<boolean>('syncing')
  if (busy) return
  await setMeta('syncing', true)
  try { await syncOnce(); await pullRemote() } finally { await setMeta('syncing', false) }
}

// ── Realtime（规范 V1.2 §9.1）：只作「云端数据库有变化」的通知 ──
// 职责边界：不做保存确认、不做冲突合并；初始订阅与断线重连成功时主动补读；
// 事件到达时仅在本机 outbox 无未确认变更且不在同步中，才触发 pullRemote。
let rtChannel: RealtimeChannel | null = null
let rtPullTimer: ReturnType<typeof setTimeout> | undefined

function scheduleRealtimePull() {
  if (rtPullTimer) clearTimeout(rtPullTimer)
  rtPullTimer = setTimeout(async () => {
    try {
      if ((await getMeta<boolean>('syncing')) || (await outboxAll()).length) return
      await pullRemote()
    } catch { /* 补读失败静默；下次事件或手动刷新重试 */ }
  }, 2000)
}

export async function startRealtime() {
  if (!cloudConfigured() || rtChannel || !(await getSession())) return
  const ch = supabase().channel('habit_tracker_changes')
  for (const t of ['places', 'entries', 'media', 'tags', 'tag_dimensions']) {
    ch.on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: t }, () => scheduleRealtimePull())
  }
  ch.subscribe((status) => {
    // SUBSCRIBED 首次到达 = 初始加载主动补读；断线重连成功后再次到达 = 重连补读
    if (status === 'SUBSCRIBED') scheduleRealtimePull()
  })
  rtChannel = ch
}

export function stopRealtime() {
  if (rtChannel) { try { supabase().removeChannel(rtChannel) } catch { /* ignore */ } rtChannel = null }
  if (rtPullTimer) { clearTimeout(rtPullTimer); rtPullTimer = undefined }
}
