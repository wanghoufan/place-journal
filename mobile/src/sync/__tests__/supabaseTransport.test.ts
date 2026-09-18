import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createFakeGateway, type FakeGateway } from '../../test/fakeSyncGateway'
import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { arrayBufferToBase64 } from '../base64'
import { createSupabaseTransport, type MediaFileReader } from '../supabaseTransport'

const OWNER = 'owner-1'

function setup(): SqlDatabase {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return db
}

function seedPlace(db: SqlDatabase, id = 'p1', revision = 1, base: number | null = null, status = 'local'): void {
  db.runSync(
    'INSERT INTO places (id, name, coord_precision, is_private, revision, base_revision, demo, sync_status) VALUES (?, ?, ?, 0, ?, ?, 0, ?)',
    id,
    `place-${id}`,
    'exact',
    revision,
    base,
    status,
  )
}

function seedEntry(db: SqlDatabase, id = 'e1', placeId = 'p1', revision = 1, base: number | null = null, status = 'local'): void {
  db.runSync(
    'INSERT INTO entries (id, place_id, visit_date, revision, base_revision, sync_status) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    placeId,
    '2026-09-18',
    revision,
    base,
    status,
  )
}

function seedMedia(db: SqlDatabase, id = 'm1', entryId = 'e1', placeId = 'p1'): void {
  db.runSync(
    `INSERT INTO media (id, entry_id, place_id, local_display_path, local_thumb_path, sort_order, sync_status)
     VALUES (?, ?, ?, ?, ?, 0, 'local')`,
    id,
    entryId,
    placeId,
    `file:///docs/place-journal/${entryId}/${id}/source-or-display.jpg`,
    `file:///docs/place-journal/${entryId}/${id}/thumb.jpg`,
  )
}

function seedTag(db: SqlDatabase, id: string, dimensionId = 'd1'): void {
  db.runSync('INSERT INTO tags (id, dimension_id, name, sort_order, revision, demo, sync_status) VALUES (?, ?, ?, 0, 1, 0, ?)', id, dimensionId, id, 'local')
}

function seedDimension(db: SqlDatabase, id = 'd1'): void {
  db.runSync('INSERT INTO tag_dimensions (id, name, kind, sort_order, revision, demo, sync_status) VALUES (?, ?, ?, 0, 1, 0, ?)', id, id, 'custom', 'local')
}

function place(db: SqlDatabase, id = 'p1') {
  return db.getFirstSync<{ revision: number; base_revision: number | null; sync_status: string }>(
    'SELECT revision, base_revision, sync_status FROM places WHERE id = ?',
    id,
  )
}

function media(db: SqlDatabase, id = 'm1') {
  return db.getFirstSync<{ remote_path: string | null; remote_thumb_path: string | null; sync_status: string }>(
    'SELECT remote_path, remote_thumb_path, sync_status FROM media WHERE id = ?',
    id,
  )
}

const mediaFiles: MediaFileReader = {
  async readBase64(uri) {
    return uri.includes('thumb')
      ? arrayBufferToBase64(new Uint8Array([1, 2, 3]).buffer)
      : arrayBufferToBase64(new Uint8Array([4, 5, 6, 7]).buffer)
  },
}

function transportFor(db: SqlDatabase, gateway: FakeGateway) {
  return createSupabaseTransport({ db, gateway, owner: OWNER, mediaFiles })
}

describe('真 PushTransport：核心实体 expected-revision', () => {
  it('首推（base_revision 为空）走 INSERT，带 owner/client_id，回读 revision 并置 synced', async () => {
    const db = setup()
    seedPlace(db, 'p1', 1, null, 'local')
    const gateway = createFakeGateway({ insertRevision: 7 })

    const result = await transportFor(db, gateway).send({ opId: 'A', kind: 'upsert_place', entityId: 'p1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    const insert = gateway.calls.find((c) => c.op === 'insert')
    expect(insert?.table).toBe('places')
    expect(insert?.row).toMatchObject({ id: 'p1', owner_user_id: OWNER, client_id: 'p1', name: 'place-p1' })
    expect(place(db)).toMatchObject({ revision: 7, base_revision: 7, sync_status: 'synced' })
  })

  it('后续走 id + revision = base_revision 条件 UPDATE（onConflict 语义由 0 行判定）', async () => {
    const db = setup()
    seedPlace(db, 'p1', 3, 2, 'local')
    const gateway = createFakeGateway()

    const result = await transportFor(db, gateway).send({ opId: 'A', kind: 'upsert_place', entityId: 'p1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    const update = gateway.calls.find((c) => c.op === 'updateIfRevision')
    expect(update?.table).toBe('places')
    expect(update?.id).toBe('p1')
    expect(update?.expectedRevision).toBe(2)
    expect(gateway.calls.some((c) => c.op === 'insert')).toBe(false)
    expect(place(db)).toMatchObject({ revision: 3, base_revision: 3, sync_status: 'synced' })
  })

  it('条件 UPDATE 0 行 → 落 conflicts + 本地标 conflict，且 op 视作完成（不重试）', async () => {
    const db = setup()
    seedPlace(db, 'p1', 3, 2, 'local')
    const gateway = createFakeGateway({ zeroRowUpdates: true })
    gateway.setRemote('places', [{ id: 'p1', name: 'remote', revision: 9 }])

    const result = await transportFor(db, gateway).send({ opId: 'A', kind: 'upsert_place', entityId: 'p1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    expect(place(db)).toMatchObject({ revision: 3, base_revision: 2, sync_status: 'conflict' })
    const conflict = db.getFirstSync<{ entity_id: string; entity_kind: string; expected_revision: number; remote_snapshot: string; status: string }>(
      'SELECT entity_id, entity_kind, expected_revision, remote_snapshot, status FROM conflicts',
    )
    expect(conflict).toMatchObject({ entity_id: 'p1', entity_kind: 'place', expected_revision: 2, status: 'open' })
    expect(JSON.parse(conflict?.remote_snapshot ?? '{}')).toMatchObject({ revision: 9 })
  })

  it('INSERT 唯一键冲突 → 取远端 revision 作 expected 重放校准', async () => {
    const db = setup()
    seedPlace(db, 'p1', 1, null, 'local')
    const gateway = createFakeGateway({ insertConflict: true })
    gateway.setRemote('places', [{ id: 'p1', revision: 5 }])

    const result = await transportFor(db, gateway).send({ opId: 'A', kind: 'upsert_place', entityId: 'p1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    expect(gateway.calls.find((c) => c.op === 'updateIfRevision')?.expectedRevision).toBe(5)
    expect(place(db)).toMatchObject({ revision: 6, base_revision: 6, sync_status: 'synced' })
  })
})

describe('真 PushTransport：entry_tags 差量', () => {
  it('upsert_entry 后按 onConflict entry_id,tag_id 先增后删', async () => {
    const db = setup()
    seedPlace(db)
    seedEntry(db, 'e1', 'p1', 1, null, 'local')
    seedDimension(db, 'd1')
    seedTag(db, 't1')
    db.runSync('INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', 'e1', 't1')
    const gateway = createFakeGateway()
    gateway.setRemote('entry_tags', [{ id: 'rt9', entry_id: 'e1', tag_id: 't9' }])

    const result = await transportFor(db, gateway).send({ opId: 'E', kind: 'upsert_entry', entityId: 'e1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    const upsert = gateway.calls.find((c) => c.op === 'upsert' && c.table === 'entry_tags')
    expect(upsert?.onConflict).toBe('entry_id,tag_id')
    expect(upsert?.rows).toEqual([{ entry_id: 'e1', tag_id: 't1', owner_user_id: OWNER }])
    const remove = gateway.calls.find((c) => c.op === 'remove' && c.table === 'entry_tags')
    expect(remove?.filters).toEqual([{ column: 'id', op: 'in', values: ['rt9'] }])
  })
})

describe('真 PushTransport：Storage 上传', () => {
  it('display/thumb 双路径上传 ArrayBuffer，media 行 onConflict owner_user_id,client_id 并置 synced', async () => {
    const db = setup()
    seedPlace(db)
    seedEntry(db)
    seedMedia(db, 'm1', 'e1', 'p1')
    const gateway = createFakeGateway()

    const result = await transportFor(db, gateway).send({ opId: 'M', kind: 'upload_media', entityId: 'm1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    const uploads = gateway.calls.filter((c) => c.op === 'upload')
    expect(uploads.map((c) => c.path)).toEqual([
      `${OWNER}/p1/m1/thumb.jpg`,
      `${OWNER}/p1/m1/display.jpg`,
    ])
    expect(uploads[0]?.bucket).toBe('habit-tracker-media-private')
    expect(uploads[0]?.data?.byteLength).toBe(3)
    expect(uploads[1]?.data?.byteLength).toBe(4)
    expect(uploads[0]?.uploadOptions).toEqual({ contentType: 'image/jpeg', upsert: true })

    const upsert = gateway.calls.find((c) => c.op === 'upsert' && c.table === 'media')
    expect(upsert?.onConflict).toBe('owner_user_id,client_id')
    expect(upsert?.rows?.[0]).toMatchObject({
      storage_path: `${OWNER}/p1/m1/display.jpg`,
      thumb_path: `${OWNER}/p1/m1/thumb.jpg`,
      entry_id: 'e1',
      place_id: 'p1',
    })
    expect(media(db)).toMatchObject({
      remote_path: `${OWNER}/p1/m1/display.jpg`,
      remote_thumb_path: `${OWNER}/p1/m1/thumb.jpg`,
      sync_status: 'synced',
    })
  })

  it('上传失败：清理已传对象、保留本地文件、不标 synced（不写 media 行）', async () => {
    const db = setup()
    seedPlace(db)
    seedEntry(db)
    seedMedia(db, 'm1', 'e1', 'p1')
    const gateway = createFakeGateway({ uploadErrorPath: `${OWNER}/p1/m1/display.jpg` })

    const result = await transportFor(db, gateway).send({ opId: 'M', kind: 'upload_media', entityId: 'm1', dependsOn: [] })

    expect(result.outcome).toBe('retry')
    expect(result.error).toContain('display.jpg')
    expect(gateway.calls.some((c) => c.op === 'upsert' && c.table === 'media')).toBe(false)
    const cleanup = gateway.calls.find((c) => c.op === 'removeObjects')
    expect(cleanup?.bucket).toBe('habit-tracker-media-private')
    expect(cleanup?.rows).toEqual([{ path: `${OWNER}/p1/m1/thumb.jpg` }])
    const row = db.getFirstSync<{ local_display_path: string; sync_status: string }>(
      'SELECT local_display_path, sync_status FROM media WHERE id = ?',
      'm1',
    )
    expect(row?.sync_status).toBe('local')
    expect(row?.local_display_path).toBe('file:///docs/place-journal/e1/m1/source-or-display.jpg')
  })
})

describe('真 PushTransport：删除语义', () => {
  it('delete_place / delete_entry 按 id + owner 删除，行不存在也不报错', async () => {
    const db = setup()
    const gateway = createFakeGateway()
    const transport = transportFor(db, gateway)

    expect((await transport.send({ opId: 'D1', kind: 'delete_place', entityId: 'p1', dependsOn: [] })).outcome).toBe('ok')
    expect((await transport.send({ opId: 'D2', kind: 'delete_entry', entityId: 'e1', dependsOn: [] })).outcome).toBe('ok')

    const removals = gateway.calls.filter((c) => c.op === 'remove')
    expect(removals[0]?.table).toBe('places')
    expect(removals[0]?.filters).toEqual([
      { column: 'id', op: 'eq', value: 'p1' },
      { column: 'owner_user_id', op: 'eq', value: OWNER },
    ])
    expect(removals[1]?.table).toBe('entries')
  })

  it('delete_tags 先清 entry_tags 关联再逐个删 tag', async () => {
    const db = setup()
    const gateway = createFakeGateway()

    const result = await transportFor(db, gateway).send({
      opId: 'DT',
      kind: 'delete_tags',
      entityIds: ['t1', 't2'],
      dependsOn: [],
    })

    expect(result.outcome).toBe('ok')
    const removals = gateway.calls.filter((c) => c.op === 'remove')
    expect(removals[0]).toMatchObject({
      table: 'entry_tags',
      filters: [{ column: 'tag_id', op: 'in', values: ['t1', 't2'] }, { column: 'owner_user_id', op: 'eq', value: OWNER }],
    })
    expect(removals.slice(1).map((c) => c.table)).toEqual(['tags', 'tags'])
  })
})

describe('真 PushTransport：分享白名单', () => {
  it('create_share 受控 upsert 快照/分享项，item 只含白名单键 + cover_url', async () => {
    const db = setup()
    db.runSync(
      `INSERT INTO share_snapshots (id, slug, kind, title, owner_name, status, created_at)
       VALUES ('s1', 'slug-1', 'list', 'Trip', 'Me', 'active', '2026-09-18T00:00:00.000Z')`,
    )
    db.runSync(
      `INSERT INTO share_items (snapshot_id, client_id, sort_order, place_name, area, rating, budget, reason, tags_json, coord_hidden, lat, lng)
       VALUES ('s1', 'i1', 0, 'Park', 'Xihu', 5, 30, 'nice', '["food"]', 1, 30.1, 120.2)`,
    )
    const gateway = createFakeGateway()

    const result = await transportFor(db, gateway).send({ opId: 'S', kind: 'create_share', entityId: 's1', dependsOn: [] })

    expect(result.outcome).toBe('ok')
    const snapshot = gateway.calls.find((c) => c.op === 'upsert' && c.table === 'share_snapshots')
    expect(snapshot?.onConflict).toBe('owner_user_id,client_id')
    expect(snapshot?.rows?.[0]).toMatchObject({ id: 's1', owner_user_id: OWNER, slug: 'slug-1', status: 'active' })

    const itemUpsert = gateway.calls.find((c) => c.op === 'upsert' && c.table === 'share_items')
    expect(itemUpsert?.onConflict).toBe('snapshot_id,client_id')
    const payload = (itemUpsert?.rows?.[0] as { item: Record<string, unknown> }).item
    expect(Object.keys(payload).sort()).toEqual(
      ['area', 'budget', 'coord_precision', 'cover_url', 'name', 'note_public', 'rating', 'tags'].sort(),
    )
    expect(payload).toMatchObject({ name: 'Park', coord_precision: 'hidden', tags: ['food'], cover_url: null })
    expect(JSON.stringify(payload)).not.toContain('transcript')
    expect(payload).not.toHaveProperty('lat')
    expect(payload).not.toHaveProperty('lng')
  })
})
