// 本地写操作层（TASK-DEV-09）：记录/地点/标签的新增、编辑、删除。
//
// 全部经 `Repository` 的原子边界（实体 + outbox 同事务），不接网络：
//   - 新建记录：可选先建地点（upsert_place），再建 entry（upsert_entry，依赖地点 op）；
//   - 编辑记录：保留 created_at/cover_media_id 等既有字段，revision 由仓库自增；
//   - 删除记录：FK 级联删 media，删空地点一并清理；
//   - 标签/维度：核心实体 + upsert_tags 入队；记录↔标签关系写 entry_tags。
//
// UI 只调用本文件导出的函数，不直接拼 SQL（除纯查询层）。

import type { SqlDatabase } from '../db/database'
import { newUuid } from '../domain/ids'
import type { EntityRow, Repository } from '../db/repository'
import { insertOutboxOp, newOpId } from '../sync/outbox'

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

/** 删除记录；若地点已无其他记录，一并清理空地点。 */
export function deleteEntry(db: SqlDatabase, repo: Repository, entryId: string): void {
  const entry = repo.get<{ place_id: string }>('entries', entryId)
  if (!entry) return
  const placeId = entry.place_id
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
