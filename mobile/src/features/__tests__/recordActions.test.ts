import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import {
  createDimension,
  createTag,
  deleteEntry,
  deletePlace,
  deleteTag,
  renameTag,
  saveRecord,
  setEntryTags,
  uniqueTagIds,
  updatePlace,
} from '../recordActions'

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
