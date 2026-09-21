// 本地写操作层（TASK-DEV-09）：记录/地点/标签的新增、编辑、删除。
//
// 全部经 `Repository` 的原子边界（实体 + outbox 同事务），不接网络：
//   - 新建记录：可选先建地点（upsert_place），再建 entry（upsert_entry，依赖地点 op）；
//   - 编辑记录：保留 created_at/cover_media_id 等既有字段，revision 由仓库自增；
//   - 搬家：entry + 其 media 一起换 place_id，有本地图的重传一份到新路径，搬空的老地点级联清理；
//   - 删记录：级联删 media、级联撤销其分享、删空地点一并清理；
//   - 标签/维度：核心实体 + upsert_tags 入队；记录↔标签关系写 entry_tags。
//
// UI 只调用本文件导出的函数，不直接拼 SQL（除纯查询层）。

import type { SqlDatabase } from '../db/database'
import { newUuid } from '../domain/ids'
import type { EntityRow, Repository } from '../db/repository'
import { insertOutboxOp, newOpId } from '../sync/outbox'
import { revokeSharesForEntry } from './shares'

export interface SaveRecordInput {
  /** 编辑时传既有 entry id；新建留空。 */
  entryId?: string
  /** 复用既有地点。 */
  placeId?: string
  /** 或新建地点。 */
  newPlace?: { name: string; area?: string }
  visitDate: string
  rating?: number
  budget?: number
  /** 私密感受（仅自己可见）。 */
  notePrivate?: string
  /** 公开分享理由。 */
  notePublic?: string
  summary?: string
  /** 仅叶子标签。 */
  tagIds?: string[]
  now?: string
}

export interface SaveRecordResult {
  entryId: string
  placeId: string
  createdPlace: boolean
  entryOpId: string
}

export class RecordValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordValidationError'
  }
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** 去重并丢弃空 id（保持入参顺序）。 */
export function uniqueTagIds(tagIds: string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of tagIds ?? []) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** 覆盖写入记录↔叶子标签关系（先删后插，幂等）。 */
export function setEntryTags(db: SqlDatabase, entryId: string, tagIds: string[] | undefined): void {
  const ids = uniqueTagIds(tagIds)
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM entry_tags WHERE entry_id = ?', entryId)
    for (const tagId of ids) {
      db.runSync('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', entryId, tagId)
    }
  })
}

/**
 * 新建 / 编辑一条记录。
 * 新建：可选建地点 → 建 entry → 写 entry_tags。返回各 id 与 entry 的 outbox op_id
 * （供媒体 upload_media op 依赖）。
 */
export function saveRecord(db: SqlDatabase, repo: Repository, input: SaveRecordInput): SaveRecordResult {
  const now = input.now ?? new Date().toISOString()
  const visitDate = input.visitDate?.trim()
  if (!visitDate) throw new RecordValidationError('请选择到访日期')

  const existing = input.entryId ? repo.get<EntityRow>('entries', input.entryId) : null
  if (input.entryId && !existing) throw new RecordValidationError('待编辑的记录不存在')

  let placeId = existing ? String(existing.place_id) : input.placeId ?? ''
  let createdPlace = false
  let placeOpId = ''

  if (!placeId) {
    const name = clean(input.newPlace?.name)
    if (!name) throw new RecordValidationError('请选择或填写地点')
    placeId = newUuid()
    placeOpId = repo.saveEntityWithOutbox(
      'places',
      {
        id: placeId,
        name,
        area: clean(input.newPlace?.area) ?? null,
        coord_precision: 'exact',
        is_private: 0,
        demo: 0,
        created_at: now,
      },
      { kind: 'upsert_place', entityId: placeId },
      { now },
    )
    createdPlace = true
  }

  const entryId = input.entryId ?? newUuid()
  const row: EntityRow = {
    id: entryId,
    place_id: placeId,
    visit_date: visitDate,
    rating: input.rating ?? null,
    budget: input.budget ?? null,
    note_private: clean(input.notePrivate) ?? null,
    note_public: clean(input.notePublic) ?? null,
    summary: clean(input.summary) ?? null,
    is_private: 0,
    demo: existing?.demo ?? 0,
  }
  if (existing) {
    // 保留不可变/非表单字段，避免编辑把封面与创建时间清空。
    if (existing.created_at != null) row.created_at = existing.created_at
    if (existing.cover_media_id != null) row.cover_media_id = existing.cover_media_id
    if (existing.transcript != null) row.transcript = existing.transcript
  } else {
    row.created_at = now
  }

  const entryOpId = repo.saveEntityWithOutbox(
    'entries',
    row,
    { kind: 'upsert_entry', entityId: entryId, dependsOn: createdPlace && placeOpId ? [placeOpId] : [] },
    { now },
  )
  setEntryTags(db, entryId, input.tagIds)

  return { entryId, placeId, createdPlace, entryOpId }
}

/** 媒体行是否带本地文件（搬家重传的判据；只有云端路径的行无处可传）。 */
function hasLocalFile(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export interface MoveEntryInput {
  entryId: string
  /** 目标地点（须已存在）。 */
  toPlaceId: string
  now?: string
}

export interface MoveEntryResult {
  /** false = 目标地点与当前相同，无副作用。 */
  moved: boolean
  /** 跟随改归属且带本地文件、已重新入队的 media 数。 */
  reuploaded: number
  /** 老地点已无任何记录，被级联清理。 */
  removedOldPlace: boolean
}

/**
 * 搬家：记录 + 它的照片一起换归属（对标 Web EntryDetail 的 saveEdit 搬家分支）。
 *
 * 云端媒体对象路径按 `owner/placeId/...` 组织（`privateDisplayPath`），换地点即换路径，
 * 所以带本地文件的 media 一律重传：置 `sync_status='local'`、清空旧的 remote 路径，
 * 并入队 `upload_media`（依赖本次 `upsert_entry`，保证云端先认新归属）。老地点搬空即删。
 *
 * 原子性（P1-2 返工）：记录换归属、media 批量换归属、各自 outbox 入队、搬空老地点清理，
 * 全部落在同一个 `withTransactionSync` 内，全成或全败。原实现分两次落盘（entry 一次事务、
 * media 另一次事务），两事务之间崩溃会留下「entry 已搬家、media 仍旧 place_id」的半搬家态——
 * outbox `dependsOn` 只保序不保原子。
 */
export function moveEntry(db: SqlDatabase, repo: Repository, input: MoveEntryInput): MoveEntryResult {
  const now = input.now ?? new Date().toISOString()
  const entry = repo.get<EntityRow>('entries', input.entryId)
  if (!entry) throw new RecordValidationError('待搬家的记录不存在')
  const oldPlaceId = String(entry.place_id)
  const toPlaceId = input.toPlaceId?.trim()
  if (!toPlaceId) throw new RecordValidationError('请选择要搬到的地方')
  if (toPlaceId === oldPlaceId) return { moved: false, reuploaded: 0, removedOldPlace: false }
  if (!repo.get('places', toPlaceId)) throw new RecordValidationError('目标地点不存在')

  const media = db.getAllSync<EntityRow>('SELECT * FROM media WHERE entry_id = ?', input.entryId)
  let entryOpId = ''
  let reuploaded = 0
  let removedOldPlace = false

  db.withTransactionSync(() => {
    // 记录换归属：照 `Repository.writeCoreEntity` 的核心实体语义（revision 单调 +1、标 dirty、
    // 清 sync_error），但必须在既有事务内执行——`repo.saveEntityWithOutbox` 会自开事务，而
    // expo-sqlite 的 `withTransactionSync` 不支持嵌套（嵌套 BEGIN 会抛错），无法与 media 更新合成一事务。
    // 未列出的列（created_at/base_revision/cover_media_id 等）保持原值不变。
    db.runSync(
      `UPDATE entries SET place_id = ?, revision = revision + 1, sync_status = 'local',
                          sync_error = NULL, updated_at = ? WHERE id = ?`,
      toPlaceId,
      now,
      input.entryId,
    )
    entryOpId = insertOutboxOp(db, { kind: 'upsert_entry', entityId: input.entryId }, { now })

    for (const m of media) {
      const mediaId = String(m.id)
      db.runSync(
        `UPDATE media SET place_id = ?, remote_path = NULL, remote_thumb_path = NULL,
                          sync_status = 'local', updated_at = ? WHERE id = ?`,
        toPlaceId,
        now,
        mediaId,
      )
      if (hasLocalFile(m.local_display_path) || hasLocalFile(m.local_thumb_path)) {
        insertOutboxOp(db, { kind: 'upload_media', entityId: mediaId, dependsOn: [entryOpId] }, { now })
        reuploaded += 1
      }
    }

    const remaining = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE place_id = ?', oldPlaceId)
    removedOldPlace = (remaining?.n ?? 0) === 0
    if (removedOldPlace) {
      db.runSync('DELETE FROM places WHERE id = ?', oldPlaceId)
      insertOutboxOp(db, { kind: 'delete_place', entityId: oldPlaceId }, { now })
    }
  })

  return { moved: true, reuploaded, removedOldPlace }
}

/** 显式设封面：media 必须属于该记录（对标 Web EntryDetail 的 setCover）。 */
export function setEntryCover(
  db: SqlDatabase,
  repo: Repository,
  input: { entryId: string; mediaId: string; now?: string },
): void {
  const entry = repo.get<EntityRow>('entries', input.entryId)
  if (!entry) throw new RecordValidationError('记录不存在')
  const media = db.getFirstSync<{ id: string }>(
    'SELECT id FROM media WHERE id = ? AND entry_id = ?',
    input.mediaId,
    input.entryId,
  )
  if (!media) throw new RecordValidationError('该照片不属于此记录')
  repo.saveEntityWithOutbox(
    'entries',
    { ...entry, id: input.entryId, cover_media_id: input.mediaId },
    { kind: 'upsert_entry', entityId: input.entryId },
    { now: input.now },
  )
}

/** 删除记录；级联撤销其分享；若地点已无其他记录，一并清理空地点。 */
export function deleteEntry(db: SqlDatabase, repo: Repository, entryId: string): void {
  const entry = repo.get<{ place_id: string }>('entries', entryId)
  if (!entry) return
  const placeId = entry.place_id
  // RQA-V-02（对标 Web `repo.deleteEntry`）：级联撤销该记录的分享。放在删除前——旧快照
  // 无 entry_id 时要按记录封面图反查，删完就查不到了。
  revokeSharesForEntry(db, repo, entryId)
  repo.removeWithOutbox('entries', entryId, { kind: 'delete_entry', entityId: entryId })
  const remaining = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE place_id = ?', placeId)
  if ((remaining?.n ?? 0) === 0) {
    repo.removeWithOutbox('places', placeId, { kind: 'delete_place', entityId: placeId })
  }
}

/** 删除地点及其全部记录（含 outbox 删除 op）。 */
export function deletePlace(db: SqlDatabase, repo: Repository, placeId: string): void {
  const entries = db.getAllSync<{ id: string }>('SELECT id FROM entries WHERE place_id = ?', placeId)
  for (const entry of entries) {
    repo.removeWithOutbox('entries', entry.id, { kind: 'delete_entry', entityId: entry.id })
  }
  repo.removeWithOutbox('places', placeId, { kind: 'delete_place', entityId: placeId })
}

/** 更新地点名称/区域（revision 由仓库自增）。 */
export function updatePlace(
  db: SqlDatabase,
  repo: Repository,
  input: { id: string; name: string; area?: string },
): void {
  const existing = repo.get<EntityRow>('places', input.id)
  if (!existing) return
  const name = input.name.trim()
  if (!name) throw new RecordValidationError('地点名称不能为空')
  repo.saveEntityWithOutbox(
    'places',
    { ...existing, id: input.id, name, area: clean(input.area) ?? null },
    { kind: 'upsert_place', entityId: input.id },
  )
}

/** 新建标签（顶层，可指定父标签）并入队 upsert_tags。 */
export function createTag(
  db: SqlDatabase,
  repo: Repository,
  input: { dimensionId: string; name: string; parentId?: string | null },
): { id: string; opId: string } {
  const name = input.name.trim()
  if (!name) throw new RecordValidationError('标签名称不能为空')
  const dimension = repo.get<{ id: string }>('tag_dimensions', input.dimensionId)
  if (!dimension) throw new RecordValidationError('所选维度不存在')
  const id = newUuid()
  const sortOrder =
    db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM tags WHERE dimension_id = ?', input.dimensionId)?.n ?? 0
  const opId = repo.saveEntityWithOutbox(
    'tags',
    {
      id,
      dimension_id: input.dimensionId,
      parent_id: input.parentId ?? null,
      name,
      alias: null,
      sort_order: sortOrder,
      demo: 0,
    },
    { kind: 'upsert_tags', entityId: id },
  )
  return { id, opId }
}

/** 维度默认名（kind → 名称），仅在目标维度缺失时用于补建。 */
const DIMENSION_NAMES: Record<string, string> = {
  scene: '场景',
  type: '类型',
  crowd: '人群',
  region: '区域',
  custom: '自定义',
}

export interface CreateTagNamedResult {
  id: string
  opId: string
  /** false = 同名标签已存在，直接复用（无新 outbox op）。 */
  created: boolean
}

/**
 * 按名字建标签（现场建标签 / AI 未命中建议词一键建）。
 * 同名标签已存在则复用，不重复建；维度按 `kind` 找（默认 scene），缺失时补建该维度。
 */
export function createTagNamed(
  db: SqlDatabase,
  repo: Repository,
  input: { name: string; kind?: string },
): CreateTagNamedResult {
  const name = input.name.trim()
  if (!name) throw new RecordValidationError('标签名称不能为空')
  const existing = db.getFirstSync<{ id: string }>('SELECT id FROM tags WHERE name = ? LIMIT 1', name)
  if (existing) return { id: existing.id, opId: '', created: false }
  const kind = input.kind?.trim() || 'scene'
  const dimension = db.getFirstSync<{ id: string }>(
    'SELECT id FROM tag_dimensions WHERE kind = ? ORDER BY sort_order ASC, name ASC LIMIT 1',
    kind,
  )
  const dimensionId = dimension?.id ?? createDimension(db, repo, { name: DIMENSION_NAMES[kind] ?? kind, kind }).id
  const tag = createTag(db, repo, { dimensionId, name })
  return { ...tag, created: true }
}

/** 重命名标签并入队 upsert_tags（保留维度/父子/排序等既有字段）。 */
export function renameTag(db: SqlDatabase, repo: Repository, input: { id: string; name: string }): void {
  const existing = repo.get<EntityRow>('tags', input.id)
  if (!existing) return
  const name = input.name.trim()
  if (!name) throw new RecordValidationError('标签名称不能为空')
  repo.saveEntityWithOutbox('tags', { ...existing, id: input.id, name }, { kind: 'upsert_tags', entityId: input.id })
}

/** 新建维度（自定义）并入队 upsert_tags（无 entity → 全量标签/维度重推，幂等）。 */
export function createDimension(
  db: SqlDatabase,
  repo: Repository,
  input: { name: string; kind?: string },
): { id: string; opId: string } {
  const name = input.name.trim()
  if (!name) throw new RecordValidationError('维度名称不能为空')
  const id = newUuid()
  const sortOrder =
    db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM tag_dimensions')?.n ?? 0
  const opId = repo.saveEntityWithOutbox(
    'tag_dimensions',
    { id, name, kind: input.kind ?? 'custom', sort_order: sortOrder, demo: 0 },
    { kind: 'upsert_tags' },
  )
  return { id, opId }
}

/** 删除标签（含子标签）：本地级联删除并入队 delete_tags（先删关联后删标签口径）。 */
export function deleteTag(db: SqlDatabase, repo: Repository, tagId: string): void {
  if (!repo.get('tags', tagId)) return
  const subtree = db
    .getAllSync<{ id: string }>(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM tags WHERE id = ?
         UNION ALL
         SELECT t.id FROM tags t JOIN subtree s ON t.parent_id = s.id
       )
       SELECT id FROM subtree`,
      tagId,
    )
    .map((row) => row.id)
  const ids = subtree.length > 0 ? subtree : [tagId]
  db.withTransactionSync(() => {
    for (const id of ids) {
      db.runSync('DELETE FROM entry_tags WHERE tag_id = ?', id)
      db.runSync('DELETE FROM tags WHERE id = ?', id)
    }
    insertOutboxOp(db, { kind: 'delete_tags', entityIds: ids })
  })
}

/** 生成新记录 id（AI Confirm 等预分配 id 用）。 */
export function nextId(): string {
  return newUuid()
}

/** 预留 op id（测试/诊断）。 */
export function nextOpId(): string {
  return newOpId()
}
