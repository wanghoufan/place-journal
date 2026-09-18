import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../database'
import { runMigrations } from '../migrations'
import { createRepository, type Repository, type EntityRow } from '../repository'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  const repo = createRepository(db)
  repo.saveCoreEntity('places', { id: 'p1', name: '地点', coord_precision: 'exact', is_private: 0 })
  repo.saveEntityWithOutbox(
    'entries',
    { id: 'e1', place_id: 'p1', visit_date: '2026-09-18', is_private: 0 },
    { kind: 'upsert_entry', entityId: 'e1' },
  )
  return { db, repo }
}

function mediaRow(id: string, order: number): EntityRow {
  return {
    id,
    entry_id: 'e1',
    place_id: 'p1',
    local_display_path: `file:///documents/place-journal/media/e1/${id}/source-or-display.jpg`,
    local_thumb_path: `file:///documents/place-journal/media/e1/${id}/thumb.jpg`,
    width: 2560,
    height: 1920,
    bytes: 1234,
    taken_at: null,
    sort_order: order,
    remote_path: null,
    remote_thumb_path: null,
    sync_status: 'local',
  }
}

function outboxRows(db: SqlDatabase) {
  return db.getAllSync<{ kind: string; entity_id: string; depends_on: string; status: string }>(
    'SELECT kind, entity_id, depends_on, status FROM outbox ORDER BY seq ASC',
  )
}

describe('repository.saveMediaBatch（T050）', () => {
  it('media 行 + upload_media op 同事务落盘，顺序与入参一致', () => {
    const { db, repo } = setup()

    const opIds = repo.saveMediaBatch([mediaRow('m1', 0), mediaRow('m2', 1)], {
      entryId: 'e1',
      coverMediaId: 'm1',
      dependsOn: ['op-entry'],
      now: '2026-09-18T00:00:00.000Z',
    })

    expect(opIds).toHaveLength(2)
    const media = repo.all<{ id: string; sort_order: number; remote_path: null; sync_status: string }>('media')
    expect(media.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(media.map((m) => m.sort_order)).toEqual([0, 1])
    expect(media[0]).toMatchObject({ remote_path: null, sync_status: 'local' })

    const ops = outboxRows(db).filter((o) => o.kind === 'upload_media')
    expect(ops.map((o) => o.kind)).toEqual(['upload_media', 'upload_media'])
    expect(ops.map((o) => o.entity_id)).toEqual(['m1', 'm2'])
    expect(JSON.parse(ops[0].depends_on)).toEqual(['op-entry'])
    expect(ops.map((o) => o.status)).toEqual(['pending', 'pending'])
  })

  it('封面=首图：回填 entry.cover_media_id 并把 entry 标 dirty（revision+1）', () => {
    const { repo } = setup()

    repo.saveMediaBatch([mediaRow('m1', 0)], { entryId: 'e1', coverMediaId: 'm1' })

    expect(repo.get<{ cover_media_id: string; sync_status: string }>('entries', 'e1')).toMatchObject({
      cover_media_id: 'm1',
      sync_status: 'local',
    })
    expect(repo.get<{ revision: number }>('entries', 'e1')?.revision).toBe(2)
    expect(repo.isDirty(repo.get('entries', 'e1')!)).toBe(true)
  })

  it('coverMediaId 为 null 时不动封面', () => {
    const { repo } = setup()

    repo.saveMediaBatch([mediaRow('m1', 0)], { entryId: 'e1', coverMediaId: null })

    expect(repo.get<{ cover_media_id: string | null }>('entries', 'e1')?.cover_media_id).toBeNull()
  })

  it('任一行非法：事务整体回滚，不留 media 行与 op', () => {
    const { db, repo } = setup()
    const bad = { ...mediaRow('m2', 1), id: undefined } as unknown as EntityRow

    expect(() => repo.saveMediaBatch([mediaRow('m1', 0), bad])).toThrow(/media\.id/)

    expect(repo.all('media')).toHaveLength(0)
    expect(outboxRows(db).filter((o) => o.kind === 'upload_media')).toHaveLength(0)
  })
})
