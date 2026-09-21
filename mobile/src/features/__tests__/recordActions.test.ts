import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import {
  createDimension,
  createTag,
  createTagNamed,
  deleteEntry,
  deletePlace,
  deleteTag,
  moveEntry,
  RecordValidationError,
  renameTag,
  saveRecord,
  setEntryCover,
  setEntryTags,
  uniqueTagIds,
  updatePlace,
} from '../recordActions'
import { createEntryShare } from '../shares'
import type { EntityRow } from '../../db/repository'

const NOW = '2026-09-18T10:00:00.000Z'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, repo: createRepository(db) }
}

function outboxKinds(db: SqlDatabase): { kind: string; entity_id: string | null; depends_on: string }[] {
  return db.getAllSync<{ kind: string; entity_id: string | null; depends_on: string }>(
    'SELECT kind, entity_id, depends_on FROM outbox ORDER BY seq ASC',
  )
}

function count(db: SqlDatabase, table: string, where = ''): number {
  return db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`)?.n ?? 0
}

describe('recordActions: 新建记录', () => {
  it('新建地点 + 记录 + 标签，outbox 顺序为 upsert_place → upsert_entry（带依赖）', () => {
    const { db, repo } = setup()
    repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })
    repo.saveCoreEntity('tags', { id: 't1', dimension_id: 'd1', name: '安静', sort_order: 0 })

    const result = saveRecord(db, repo, {
      newPlace: { name: '海边咖啡', area: '海口' },
      visitDate: '2026-09-18',
      rating: 5,
      budget: 45,
      notePrivate: '很安静',
      notePublic: '适合聊天',
      tagIds: ['t1', 't1', ''],
    })

    expect(result.createdPlace).toBe(true)
    expect(repo.get('places', result.placeId)).not.toBeNull()
    expect(repo.get('entries', result.entryId)).toMatchObject({
      visit_date: '2026-09-18',
      rating: 5,
      note_private: '很安静',
      note_public: '适合聊天',
      sync_status: 'local',
    })
    expect(db.getAllSync('SELECT tag_id FROM entry_tags')).toEqual([{ tag_id: 't1' }])

    const ops = outboxKinds(db)
    expect(ops.map((o) => o.kind)).toEqual(['upsert_place', 'upsert_entry'])
    const placeOpId = db.getFirstSync<{ op_id: string }>("SELECT op_id FROM outbox WHERE kind = 'upsert_place'")!.op_id
    expect(JSON.parse(ops[1].depends_on)).toEqual([placeOpId])
    expect(ops[1].entity_id).toBe(result.entryId)
  })

  it('复用既有地点时不建地点、entry 无依赖；缺地点/日期报错', () => {
    const { db, repo } = setup()
    repo.saveCoreEntity('places', { id: 'p1', name: '旧地点', coord_precision: 'exact', is_private: 0, demo: 0 })

    const result = saveRecord(db, repo, { placeId: 'p1', visitDate: '2026-09-18' })

    expect(result.createdPlace).toBe(false)
    expect(outboxKinds(db).map((o) => o.kind)).toEqual(['upsert_entry'])
    expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM places")?.n).toBe(1)

    expect(() => saveRecord(db, repo, { visitDate: '2026-09-18' })).toThrow(/地点/)
    expect(() => saveRecord(db, repo, { placeId: 'p1', visitDate: '  ' })).toThrow(/日期/)
  })
})

describe('recordActions: 编辑记录', () => {
  it('保留封面与创建时间，仅更新表单字段并 revision+1', () => {
    const { db, repo } = setup()
    const created = saveRecord(db, repo, {
      newPlace: { name: '地点' },
      visitDate: '2026-09-10',
      notePrivate: '原感受',
    })
    db.runSync('UPDATE entries SET cover_media_id = ?, created_at = ? WHERE id = ?', 'm1', '2026-09-10T00:00:00.000Z', created.entryId)
    const before = repo.get<{ revision: number }>('entries', created.entryId)!

    saveRecord(db, repo, {
      entryId: created.entryId,
      placeId: created.placeId,
      visitDate: '2026-09-18',
      rating: 4,
      notePrivate: '新感受',
    })

    const after = repo.get<Record<string, unknown>>('entries', created.entryId)!
    expect(after).toMatchObject({
      visit_date: '2026-09-18',
      rating: 4,
      note_private: '新感受',
      cover_media_id: 'm1',
      created_at: '2026-09-10T00:00:00.000Z',
    })
    expect(after.revision).toBe(before.revision + 1)
    expect(count(db, 'places')).toBe(1)
  })

  it('编辑不存在的记录抛错', () => {
    const { db, repo } = setup()
    expect(() => saveRecord(db, repo, { entryId: 'missing', placeId: 'p1', visitDate: '2026-09-18' })).toThrow(/不存在/)
  })
})

describe('recordActions: 删除记录/地点', () => {
  it('删除记录级联删媒体；删空地点一并清理并入队', () => {
    const { db, repo } = setup()
    const created = saveRecord(db, repo, { newPlace: { name: '地点' }, visitDate: '2026-09-18' })
    repo.upsert('media', {
      id: 'm1',
      entry_id: created.entryId,
      place_id: created.placeId,
      sort_order: 0,
      sync_status: 'local',
    })

    deleteEntry(db, repo, created.entryId)

    expect(count(db, 'entries')).toBe(0)
    expect(count(db, 'places')).toBe(0)
    expect(count(db, 'media')).toBe(0)
    expect(outboxKinds(db).map((o) => o.kind)).toEqual(['upsert_place', 'upsert_entry', 'delete_entry', 'delete_place'])
  })

  it('地点还有其他记录时不清理地点', () => {
    const { db, repo } = setup()
    const a = saveRecord(db, repo, { newPlace: { name: '地点' }, visitDate: '2026-09-10' })
    saveRecord(db, repo, { placeId: a.placeId, visitDate: '2026-09-18' })

    deleteEntry(db, repo, a.entryId)

    expect(count(db, 'places')).toBe(1)
    expect(count(db, 'entries')).toBe(1)
  })

  it('deletePlace 删除全部记录与地点', () => {
    const { db, repo } = setup()
    const a = saveRecord(db, repo, { newPlace: { name: '地点' }, visitDate: '2026-09-10' })
    saveRecord(db, repo, { placeId: a.placeId, visitDate: '2026-09-18' })

    deletePlace(db, repo, a.placeId)

    expect(count(db, 'places')).toBe(0)
    expect(count(db, 'entries')).toBe(0)
    const kinds = outboxKinds(db).map((o) => o.kind)
    expect(kinds.filter((k) => k === 'delete_entry')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'delete_place')).toHaveLength(1)
  })
})

describe('recordActions: 地点与标签', () => {
  it('updatePlace 更新名称区域并入队', () => {
    const { db, repo } = setup()
    const a = saveRecord(db, repo, { newPlace: { name: '旧名' }, visitDate: '2026-09-18' })

    updatePlace(db, repo, { id: a.placeId, name: '新名', area: '新区域' })

    expect(repo.get('places', a.placeId)).toMatchObject({ name: '新名', area: '新区域' })
    expect(() => updatePlace(db, repo, { id: a.placeId, name: '  ' })).toThrow(/名称/)
  })

  it('createTag / createDimension 落库并入队 upsert_tags', () => {
    const { db, repo } = setup()
    const dim = createDimension(db, repo, { name: '氛围' })
    const tag = createTag(db, repo, { dimensionId: dim.id, name: '放松' })

    expect(repo.get('tags', tag.id)).toMatchObject({ name: '放松', dimension_id: dim.id })
    expect(repo.get('tag_dimensions', dim.id)).toMatchObject({ name: '氛围', kind: 'custom' })
    expect(outboxKinds(db).map((o) => o.kind)).toEqual(['upsert_tags', 'upsert_tags'])
    expect(() => createTag(db, repo, { dimensionId: 'missing', name: 'x' })).toThrow(/维度/)
  })

  it('renameTag 保留维度/父子关系并入队 upsert_tags；空名报错', () => {
    const { db, repo } = setup()
    const dim = createDimension(db, repo, { name: '氛围' })
    const parent = createTag(db, repo, { dimensionId: dim.id, name: '户外' })
    const child = createTag(db, repo, { dimensionId: dim.id, name: '海边', parentId: parent.id })

    renameTag(db, repo, { id: child.id, name: '海边落日' })

    expect(repo.get('tags', child.id)).toMatchObject({
      name: '海边落日',
      dimension_id: dim.id,
      parent_id: parent.id,
    })
    // 维度 + 父标签 + 子标签 + 改名 = 4 条 upsert_tags，改名 op 指向被改的标签
    const renameOps = outboxKinds(db).filter((o) => o.kind === 'upsert_tags')
    expect(renameOps).toHaveLength(4)
    expect(renameOps[3].entity_id).toBe(child.id)
    expect(() => renameTag(db, repo, { id: child.id, name: '  ' })).toThrow(/名称/)
  })

  it('deleteTag 级联删子标签与关联并入队 delete_tags', () => {
    const { db, repo } = setup()
    const dim = createDimension(db, repo, { name: '氛围' })
    const parent = createTag(db, repo, { dimensionId: dim.id, name: '户外' })
    const child = createTag(db, repo, { dimensionId: dim.id, name: '海边', parentId: parent.id })
    const created = saveRecord(db, repo, { newPlace: { name: '地点' }, visitDate: '2026-09-18', tagIds: [child.id] })

    deleteTag(db, repo, parent.id)

    expect(count(db, 'tags')).toBe(0)
    expect(count(db, 'entry_tags')).toBe(0)
    expect(repo.get('entries', created.entryId)).not.toBeNull()
    const op = db.getFirstSync<{ entity_ids: string }>("SELECT entity_ids FROM outbox WHERE kind = 'delete_tags'")!
    expect(JSON.parse(op.entity_ids).sort()).toEqual([parent.id, child.id].sort())
  })
})

describe('recordActions: 纯函数', () => {
  it('uniqueTagIds 去重去空保序；setEntryTags 覆盖式写入', () => {
    expect(uniqueTagIds(['a', '', 'b', 'a'])).toEqual(['a', 'b'])
    const { db, repo } = setup()
    repo.saveCoreEntity('places', { id: 'p1', name: 'x', coord_precision: 'exact', is_private: 0, demo: 0 })
    repo.saveCoreEntity('entries', { id: 'e1', place_id: 'p1', visit_date: '2026-09-18', is_private: 0, demo: 0 })
    repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })
    for (const id of ['t1', 't2', 't3']) {
      repo.saveCoreEntity('tags', { id, dimension_id: 'd1', name: id, sort_order: 0 })
    }
    setEntryTags(db, 'e1', ['t1', 't2'])
    setEntryTags(db, 'e1', ['t2', 't3'])
    expect(db.getAllSync('SELECT tag_id FROM entry_tags ORDER BY tag_id')).toEqual([{ tag_id: 't2' }, { tag_id: 't3' }])
  })
})

describe('recordActions: 搬家（记录＋照片一起换归属）', () => {
  /** 建两个地点，返回旧地点下的记录与目标地点。 */
  function seedTwoPlaces(db: SqlDatabase, repo: Repository) {
    const from = saveRecord(db, repo, { newPlace: { name: '旧地点' }, visitDate: '2026-09-10' })
    const to = saveRecord(db, repo, { newPlace: { name: '新地点' }, visitDate: '2026-09-18' })
    return { from, to }
  }

  it('记录与照片一起换归属；带本地文件的照片重传；搬空的老地点清理', () => {
    const { db, repo } = setup()
    const { from, to } = seedTwoPlaces(db, repo)
    repo.upsert('media', {
      id: 'm1',
      entry_id: from.entryId,
      place_id: from.placeId,
      local_display_path: 'file:///documents/d.jpg',
      local_thumb_path: 'file:///documents/t.jpg',
      remote_path: 'owner/old/d.jpg',
      remote_thumb_path: 'owner/old/t.jpg',
      sort_order: 0,
      sync_status: 'synced',
    })
    // 演示数据只有远端 URI，没有本地文件 → 无处可传（不重传）；归属已改，行标 dirty 如实反映。
    repo.upsert('media', {
      id: 'm2',
      entry_id: from.entryId,
      place_id: from.placeId,
      demo_uri: 'https://picsum.photos/seed/1',
      sort_order: 1,
      sync_status: 'synced',
    })

    const result = moveEntry(db, repo, { entryId: from.entryId, toPlaceId: to.placeId, now: NOW })

    expect(result).toEqual({ moved: true, reuploaded: 1, removedOldPlace: true })
    expect(repo.get<EntityRow>('entries', from.entryId)).toMatchObject({ place_id: to.placeId, revision: 2 })
    // 老地点已无记录 → 删除并入队 delete_place
    expect(repo.get('places', from.placeId)).toBeNull()
    expect(repo.get<EntityRow>('media', 'm1')).toMatchObject({
      place_id: to.placeId,
      remote_path: null,
      remote_thumb_path: null,
      sync_status: 'local',
    })
    expect(repo.get<EntityRow>('media', 'm2')).toMatchObject({ place_id: to.placeId, sync_status: 'local' })

    const ops = outboxKinds(db)
    const moveEntryOp = ops.filter((o) => o.kind === 'upsert_entry').pop()!
    expect(moveEntryOp.entity_id).toBe(from.entryId)
    const uploadOps = ops.filter((o) => o.kind === 'upload_media')
    expect(uploadOps).toHaveLength(1)
    expect(uploadOps[0].entity_id).toBe('m1')
    const moveOpId = db.getFirstSync<{ op_id: string }>(
      "SELECT op_id FROM outbox WHERE kind = 'upsert_entry' ORDER BY seq DESC LIMIT 1",
    )!.op_id
    expect(JSON.parse(uploadOps[0].depends_on)).toEqual([moveOpId])
    expect(ops[ops.length - 1].kind).toBe('delete_place')
  })

  it('搬家是单事务：media 更新失败时 entry 不搬家、outbox/老地点零残留（P1-2）', () => {
    const { db, repo } = setup()
    const { from, to } = seedTwoPlaces(db, repo)
    repo.upsert('media', {
      id: 'm1',
      entry_id: from.entryId,
      place_id: from.placeId,
      local_display_path: 'file:///documents/d.jpg',
      remote_path: 'owner/old/d.jpg',
      sort_order: 0,
      sync_status: 'synced',
    })
    const opsBefore = count(db, 'outbox')
    const entryBefore = repo.get<EntityRow>('entries', from.entryId)!

    // 模拟第二个写入点失败：media 更新抛错，整段事务必须回滚，不能留下「entry 已搬家、media 仍旧」的半搬家态。
    const failing: SqlDatabase = {
      ...db,
      runSync(source, ...params) {
        if (/UPDATE\s+media/i.test(source)) throw new Error('disk full')
        return db.runSync(source, ...params)
      },
    }

    expect(() => moveEntry(failing, repo, { entryId: from.entryId, toPlaceId: to.placeId, now: NOW })).toThrow('disk full')

    expect(repo.get<EntityRow>('entries', from.entryId)).toMatchObject({
      place_id: from.placeId,
      revision: entryBefore.revision,
    })
    expect(repo.get<EntityRow>('media', 'm1')).toMatchObject({
      place_id: from.placeId,
      remote_path: 'owner/old/d.jpg',
      sync_status: 'synced',
    })
    expect(count(db, 'outbox')).toBe(opsBefore)
    expect(repo.get('places', from.placeId)).not.toBeNull()
  })

  it('老地点还有别的记录时不清理；同地点搬家无副作用', () => {
    const { db, repo } = setup()
    const { from, to } = seedTwoPlaces(db, repo)
    const sibling = saveRecord(db, repo, { placeId: from.placeId, visitDate: '2026-09-12' })
    const opsBefore = count(db, 'outbox')

    const same = moveEntry(db, repo, { entryId: from.entryId, toPlaceId: from.placeId, now: NOW })
    expect(same).toEqual({ moved: false, reuploaded: 0, removedOldPlace: false })
    expect(count(db, 'outbox')).toBe(opsBefore)

    const result = moveEntry(db, repo, { entryId: from.entryId, toPlaceId: to.placeId, now: NOW })

    expect(result.removedOldPlace).toBe(false)
    expect(repo.get<EntityRow>('entries', sibling.entryId)).toMatchObject({ place_id: from.placeId })
    expect(repo.get('places', from.placeId)).not.toBeNull()
    expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'delete_place'")?.n).toBe(0)
  })

  it('记录不存在 / 目标地点不存在 / 目标为空 → 抛 RecordValidationError 且不落库', () => {
    const { db, repo } = setup()
    const { from } = seedTwoPlaces(db, repo)
    const opsBefore = count(db, 'outbox')

    expect(() => moveEntry(db, repo, { entryId: 'missing', toPlaceId: from.placeId })).toThrow(/不存在/)
    expect(() => moveEntry(db, repo, { entryId: from.entryId, toPlaceId: 'missing-place' })).toThrow(RecordValidationError)
    expect(() => moveEntry(db, repo, { entryId: from.entryId, toPlaceId: '  ' })).toThrow(/地方/)
    expect(count(db, 'outbox')).toBe(opsBefore)
    expect(repo.get<EntityRow>('entries', from.entryId)).toMatchObject({ place_id: from.placeId })
  })
})

describe('recordActions: 显式设封面', () => {
  it('cover_media_id 更新、revision+1 并入队 upsert_entry', () => {
    const { db, repo } = setup()
    const created = saveRecord(db, repo, { newPlace: { name: '地点' }, visitDate: '2026-09-18' })
    repo.upsert('media', { id: 'm1', entry_id: created.entryId, place_id: created.placeId, sort_order: 0, sync_status: 'local' })
    const before = repo.get<{ revision: number }>('entries', created.entryId)!

    setEntryCover(db, repo, { entryId: created.entryId, mediaId: 'm1', now: NOW })

    const after = repo.get<Record<string, unknown>>('entries', created.entryId)!
    expect(after.cover_media_id).toBe('m1')
    expect(after.revision).toBe(before.revision + 1)
    const op = outboxKinds(db).filter((o) => o.kind === 'upsert_entry').pop()!
    expect(op.entity_id).toBe(created.entryId)
  })

  it('照片不属于该记录 / 记录不存在 → 抛错且不改封面', () => {
    const { db, repo } = setup()
    const created = saveRecord(db, repo, { newPlace: { name: '地点' }, visitDate: '2026-09-18' })
    const other = saveRecord(db, repo, { placeId: created.placeId, visitDate: '2026-09-17' })
    repo.upsert('media', { id: 'm-other', entry_id: other.entryId, place_id: created.placeId, sort_order: 0, sync_status: 'local' })

    expect(() => setEntryCover(db, repo, { entryId: created.entryId, mediaId: 'm-other' })).toThrow(RecordValidationError)
    expect(() => setEntryCover(db, repo, { entryId: 'missing', mediaId: 'm-other' })).toThrow(/不存在/)
    expect(repo.get<EntityRow>('entries', created.entryId)?.cover_media_id).toBeNull()
  })
})

describe('recordActions: 删除记录级联撤销分享（RQA-V-02）', () => {
  it('删除记录后它的分享失效，其他记录的分享不受影响', () => {
    const { db, repo } = setup()
    const a = saveRecord(db, repo, { newPlace: { name: '地点 A' }, visitDate: '2026-09-10', notePublic: '理由 A' })
    const b = saveRecord(db, repo, { newPlace: { name: '地点 B' }, visitDate: '2026-09-18', notePublic: '理由 B' })
    createEntryShare(db, repo, { entryId: a.entryId, slug: 'slug-a', now: NOW })
    createEntryShare(db, repo, { entryId: b.entryId, slug: 'slug-b', now: NOW })

    deleteEntry(db, repo, a.entryId)

    const statusOf = (slug: string) =>
      db.getFirstSync<{ status: string }>('SELECT status FROM share_snapshots WHERE slug = ?', slug)?.status
    expect(statusOf('slug-a')).toBe('revoked')
    expect(statusOf('slug-b')).toBe('active')
    const revokeOps = db.getAllSync<{ entity_id: string }>(
      "SELECT entity_id FROM outbox WHERE kind = 'revoke_share' ORDER BY seq ASC",
    )
    expect(revokeOps).toEqual([{ entity_id: 'slug-a' }])
  })
})

describe('recordActions: 按名建标签（现场建标签 / 未命中一键建）', () => {
  it('维度缺失时补建「场景」维度再建标签，并入队 upsert_tags', () => {
    const { db, repo } = setup()

    const result = createTagNamed(db, repo, { name: '露台' })

    expect(result.created).toBe(true)
    expect(result.opId).not.toBe('')
    expect(db.getAllSync<{ name: string }>('SELECT name, kind FROM tag_dimensions')).toEqual([
      { name: '场景', kind: 'scene' },
    ])
    const tag = repo.get<{ name: string; parent_id: string | null; demo: number }>('tags', result.id)!
    expect(tag).toMatchObject({ name: '露台', parent_id: null, demo: 0 })
    expect(outboxKinds(db).map((o) => o.kind)).toEqual(['upsert_tags', 'upsert_tags'])
  })

  it('已有 scene 维度时直接落进去，不再补建维度', () => {
    const { db, repo } = setup()
    repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })

    const result = createTagNamed(db, repo, { name: '露台' })

    expect(count(db, 'tag_dimensions')).toBe(1)
    expect(repo.get<{ dimension_id: string }>('tags', result.id)!.dimension_id).toBe('d1')
  })

  it('同名标签已存在则复用：不重复建、不新增 outbox', () => {
    const { db, repo } = setup()
    const dim = createDimension(db, repo, { name: '场景', kind: 'scene' })
    const existing = createTag(db, repo, { dimensionId: dim.id, name: '露台' })
    const opsBefore = count(db, 'outbox')

    const result = createTagNamed(db, repo, { name: ' 露台 ' })

    expect(result).toEqual({ id: existing.id, opId: '', created: false })
    expect(count(db, 'tags')).toBe(1)
    expect(count(db, 'outbox')).toBe(opsBefore)
  })

  it('空名抛 RecordValidationError（不落库）', () => {
    const { db, repo } = setup()
    expect(() => createTagNamed(db, repo, { name: '   ' })).toThrow(RecordValidationError)
    expect(count(db, 'tags')).toBe(0)
  })
})
