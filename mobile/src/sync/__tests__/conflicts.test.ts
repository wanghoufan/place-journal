import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import {
  addConflictRecord,
  findOpenConflict,
  getConflict,
  listOpenConflicts,
  resolveConflict,
} from '../conflicts'

function setup(): SqlDatabase {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return db
}

function insertPlace(db: SqlDatabase, name: string, revision: number, base: number | null, status: string): void {
  db.runSync(
    `INSERT INTO places (id, name, coord_precision, is_private, revision, base_revision, demo, sync_status)
     VALUES ('p1', ?, 'exact', 0, ?, ?, 0, ?)`,
    name,
    revision,
    base,
    status,
  )
}

function getPlace(db: SqlDatabase) {
  return db.getFirstSync<{ name: string; revision: number; base_revision: number | null; sync_status: string }>(
    'SELECT name, revision, base_revision, sync_status FROM places WHERE id = ?',
    'p1',
  )
}

const remoteSnapshot = { id: 'p1', name: 'cloud', coord_precision: 'exact', is_private: false, revision: 3 }

describe('conflicts: 登记与查询', () => {
  it('open 冲突可列出；findOpenConflict 命中同实体', () => {
    const db = setup()
    const id = addConflictRecord(db, {
      entityId: 'p1',
      entityKind: 'place',
      expectedRevision: 2,
      localSnapshot: { id: 'p1', name: 'local', revision: 5 },
      remoteSnapshot,
    })

    expect(getConflict(db, id)).toMatchObject({ entity_id: 'p1', entity_kind: 'place', status: 'open' })
    expect(listOpenConflicts(db)).toHaveLength(1)
    expect(findOpenConflict(db, 'place', 'p1')?.id).toBe(id)
    expect(findOpenConflict(db, 'place', 'p2')).toBeNull()
  })
})

describe('conflicts: 裁决', () => {
  it('take_remote：远端快照覆盖本地并置 synced（base=远端 revision）', () => {
    const db = setup()
    insertPlace(db, 'local', 5, 2, 'local')
    const id = addConflictRecord(db, {
      entityId: 'p1',
      entityKind: 'place',
      expectedRevision: 2,
      localSnapshot: { id: 'p1', name: 'local', revision: 5 },
      remoteSnapshot,
    })

    const result = resolveConflict(db, id, 'take_remote')

    expect(result.ok).toBe(true)
    expect(getPlace(db)).toMatchObject({ name: 'cloud', revision: 3, base_revision: 3, sync_status: 'synced' })
    expect(getConflict(db, id)).toMatchObject({ status: 'take_remote' })
    expect(listOpenConflicts(db)).toHaveLength(0)
  })

  it('keep_local：本地内容保留，base 对齐远端、revision 继续前进并标 local', () => {
    const db = setup()
    insertPlace(db, 'local', 5, 2, 'local')
    const id = addConflictRecord(db, {
      entityId: 'p1',
      entityKind: 'place',
      expectedRevision: 2,
      localSnapshot: { id: 'p1', name: 'local', revision: 5 },
      remoteSnapshot,
    })

    const result = resolveConflict(db, id, 'keep_local')

    expect(result.ok).toBe(true)
    expect(getPlace(db)).toMatchObject({ name: 'local', revision: 6, base_revision: 3, sync_status: 'local' })
    expect(getConflict(db, id)).toMatchObject({ status: 'keep_local' })
  })

  it('已裁决的冲突不能重复裁决', () => {
    const db = setup()
    insertPlace(db, 'local', 5, 2, 'local')
    const id = addConflictRecord(db, {
      entityId: 'p1',
      entityKind: 'place',
      expectedRevision: 2,
      localSnapshot: { id: 'p1', name: 'local', revision: 5 },
      remoteSnapshot,
    })
    resolveConflict(db, id, 'keep_local')

    const again = resolveConflict(db, id, 'take_remote')
    expect(again.ok).toBe(false)
    expect(again.error).toContain('已裁决')
  })

  it('take_remote 但云端快照缺失 → 拒绝并提示保留本地', () => {
    const db = setup()
    insertPlace(db, 'local', 5, 2, 'local')
    const id = addConflictRecord(db, {
      entityId: 'p1',
      entityKind: 'place',
      expectedRevision: 2,
      localSnapshot: { id: 'p1', name: 'local', revision: 5 },
      remoteSnapshot: null,
    })

    const result = resolveConflict(db, id, 'take_remote')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('保留本地')
    expect(getConflict(db, id)).toMatchObject({ status: 'open' })
  })

  it('冲突不存在 → 明示错误', () => {
    const db = setup()
    expect(resolveConflict(db, 999, 'take_remote')).toMatchObject({ ok: false })
  })
})
