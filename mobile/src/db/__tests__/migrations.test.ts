import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  MigrationDowngradeError,
  MigrationIntegrityError,
  appliedVersions,
  currentSchemaVersion,
  getUserVersion,
  reconcileExpectedColumns,
  runMigrations,
  type Migration,
} from '../migrations'
import { initializeDatabase } from '../index'
import {
  EXPECTED_COLUMNS,
  MIGRATIONS_DDL,
  SCHEMA_MIGRATIONS_TABLE,
  V1_TABLES,
  V1_TABLES_DDL,
  listUserTables,
} from '../schema'
import { applyConnectionPragmas, type SqlDatabase } from '../database'
import { listGalleryEntries } from '../../features/queries'
import { getSyncSummary } from '../../features/status'

function freshDb(): SqlDatabase {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  return db
}

function tableExists(db: SqlDatabase, name: string): boolean {
  return listUserTables(db).includes(name)
}

describe('migrations: V1 建表', () => {
  it('全新库迁移后建出 11 张业务表 + 账本，版本前进到最新', () => {
    const db = freshDb()
    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(getUserVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    const tables = listUserTables(db)
    for (const t of V1_TABLES) expect(tables).toContain(t)
    expect(tables).toContain('schema_migrations')
    expect(appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version))
  })

  it('核心实体列与 domain/types.ts 对齐（抽查 places/entries/outbox/conflicts）', () => {
    const db = freshDb()
    runMigrations(db)
    const cols = (t: string) =>
      db.getAllSync<{ name: string }>(`PRAGMA table_info(${t})`).map((r) => r.name)

    expect(cols('places')).toEqual(
      expect.arrayContaining(['id', 'name', 'area', 'lat', 'lng', 'coord_precision', 'is_private', 'revision', 'base_revision', 'demo', 'sync_status', 'created_at', 'updated_at']),
    )
    expect(cols('entries')).toEqual(
      expect.arrayContaining(['id', 'place_id', 'visit_date', 'rating', 'budget', 'transcript', 'note_private', 'note_public', 'summary', 'cover_media_id', 'is_private', 'revision', 'base_revision', 'sync_status', 'sync_error']),
    )
    expect(cols('media')).toEqual(
      expect.arrayContaining(['id', 'entry_id', 'place_id', 'local_display_path', 'local_thumb_path', 'remote_path', 'remote_thumb_path', 'sort_order']),
    )
    expect(cols('outbox')).toEqual(
      expect.arrayContaining(['seq', 'op_id', 'kind', 'entity_id', 'entity_ids', 'depends_on', 'status', 'attempts', 'last_error', 'created_at', 'claimed_at', 'parked_at']),
    )
    expect(cols('conflicts')).toEqual(
      expect.arrayContaining(['entity_id', 'entity_kind', 'expected_revision', 'local_snapshot', 'remote_snapshot', 'status', 'created_at']),
    )
  })
})

describe('migrations: 幂等与向前', () => {
  it('重复执行不报错、不丢数据、不重复记账', () => {
    const db = freshDb()
    runMigrations(db)
    db.runSync("INSERT INTO places (id, name) VALUES (?, ?)", 'p1', '西海岸')

    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version))
    expect(db.getFirstSync<{ name: string }>('SELECT name FROM places WHERE id = ?', 'p1')?.name).toBe('西海岸')
  })

  it('user_version 与账本不一致时以账本为准回写', () => {
    const db = freshDb()
    runMigrations(db)
    db.execSync('PRAGMA user_version = 0')

    expect(currentSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(getUserVersion(db)).toBe(LATEST_SCHEMA_VERSION)
  })

  it('库版本高于 App 支持版本时抛降级错误且不建业务表（R-05）', () => {
    const db = freshDb()
    db.execSync('PRAGMA user_version = 99')

    expect(() => runMigrations(db)).toThrow(MigrationDowngradeError)
    expect(tableExists(db, 'places')).toBe(false)
  })

  it('账本含未知版本时抛完整性错误，禁止继续迁移', () => {
    const db = freshDb()
    db.execSync('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)')
    db.runSync('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', 5, '2026-09-18T00:00:00.000Z')

    expect(() => runMigrations(db)).toThrow(MigrationIntegrityError)
  })
})

describe('migrations: 失败回滚（事务原子）', () => {
  const v1: Migration = {
    version: 1,
    name: 'create-a',
    up(db) {
      db.execSync('CREATE TABLE a (id TEXT PRIMARY KEY NOT NULL)')
    },
  }
  const failingV2: Migration = {
    version: 2,
    name: 'create-b-then-fail',
    up(db) {
      db.execSync('CREATE TABLE b (id TEXT PRIMARY KEY NOT NULL)')
      throw new Error('boom')
    },
  }

  it('某版 up 抛错时该版整体回滚：表不残留、版本不前进', () => {
    const db = freshDb()

    expect(() => runMigrations(db, [v1, failingV2])).toThrow('boom')
    expect(getUserVersion(db)).toBe(1)
    expect(appliedVersions(db)).toEqual([1])
    expect(tableExists(db, 'a')).toBe(true)
    expect(tableExists(db, 'b')).toBe(false)
  })

  it('修复后可继续前进（forward-only 不回头）', () => {
    const db = freshDb()
    expect(() => runMigrations(db, [v1, failingV2])).toThrow()
    const v2Fixed: Migration = {
      version: 2,
      name: 'create-b',
      up(db) {
        db.execSync('CREATE TABLE b (id TEXT PRIMARY KEY NOT NULL)')
      },
    }

    expect(runMigrations(db, [v1, v2Fixed])).toBe(2)
    expect(tableExists(db, 'b')).toBe(true)
  })
})

// 老 V1 库：全表已建（历史 V1 DDL 形状），但 entries 缺 cover_media_id；账本与 user_version 停在 v1，且已有真实数据行。
function legacyV1Db(): SqlDatabase {
  const db = freshDb()
  db.execSync(V1_TABLES_DDL)
  // 还原“老 V1 DDL”形状：去掉后来才进 DDL 的列（forward-only 只会 ADD，不会 DROP）。
  db.execSync('ALTER TABLE entries DROP COLUMN cover_media_id')
  db.execSync(MIGRATIONS_DDL)
  db.runSync(
    `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`,
    1,
    '2026-09-01T00:00:00.000Z',
  )
  db.execSync('PRAGMA user_version = 1')
  db.runSync('INSERT INTO places (id, name) VALUES (?, ?)', 'p1', '旧地点')
  db.runSync(
    'INSERT INTO entries (id, place_id, visit_date, note_private) VALUES (?, ?, ?, ?)',
    'e1',
    'p1',
    '2026-09-01',
    '旧私密感受',
  )
  return db
}

function entryColumns(db: SqlDatabase): string[] {
  return db.getAllSync<{ name: string }>('PRAGMA table_info(entries)').map((r) => r.name)
}

describe('migrations: V2 补 entries.cover_media_id（真机老库缺列 P0）', () => {
  it('老 V1 库无该列；迁移后列存在且旧行完整保留', () => {
    const db = legacyV1Db()
    expect(entryColumns(db)).not.toContain('cover_media_id')

    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(entryColumns(db)).toContain('cover_media_id')
    expect(appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version))
    expect(
      db.getFirstSync<{ id: string; note_private: string; cover_media_id: string | null }>(
        'SELECT id, note_private, cover_media_id FROM entries WHERE id = ?',
        'e1',
      ),
    ).toEqual({ id: 'e1', note_private: '旧私密感受', cover_media_id: null })
  })

  it('迁移后新查询层可正常读取（白屏根因消除）', () => {
    const db = legacyV1Db()

    runMigrations(db)

    const gallery = listGalleryEntries(db)
    expect(gallery).toHaveLength(1)
    expect(gallery[0]).toMatchObject({ id: 'e1', placeName: '旧地点', notePrivate: '旧私密感受' })
    expect(gallery[0].coverMediaId).toBeUndefined()
  })

  it('重复跑安全：再加一次仍然只有一列、版本不前进、数据不丢', () => {
    const db = legacyV1Db()
    runMigrations(db)

    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(entryColumns(db).filter((c) => c === 'cover_media_id')).toHaveLength(1)
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n).toBe(1)
  })
})

function columnNames(db: SqlDatabase, table: string): string[] {
  return db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name)
}

/** 真机老库多列漂移：全是 nullable 列（可 ADD），覆盖「不止 cover_media_id 一列」。 */
const DRIFT_COLUMNS: { table: string; column: string }[] = [
  { table: 'entries', column: 'cover_media_id' },
  { table: 'entries', column: 'sync_error' },
  { table: 'entries', column: 'summary' },
  { table: 'entries', column: 'note_public' },
  { table: 'places', column: 'sync_error' },
  { table: 'media', column: 'remote_path' },
  { table: 'media', column: 'remote_thumb_path' },
  { table: 'media', column: 'demo_uri' },
  { table: 'share_items', column: 'cover_media_id' },
  { table: 'share_items', column: 'cover_uri' },
]

/** 老库：全表已建但缺 DRIFT_COLUMNS 多列，账本/user_version 停在 v1，且已有旧数据行。 */
function legacyMultiDriftDb(): SqlDatabase {
  const db = freshDb()
  db.execSync(V1_TABLES_DDL)
  for (const { table, column } of DRIFT_COLUMNS) {
    db.execSync(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  }
  db.execSync(MIGRATIONS_DDL)
  db.runSync(
    `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`,
    1,
    '2026-09-01T00:00:00.000Z',
  )
  db.execSync('PRAGMA user_version = 1')
  db.runSync('INSERT INTO places (id, name) VALUES (?, ?)', 'p1', '旧地点')
  db.runSync(
    'INSERT INTO entries (id, place_id, visit_date, note_private) VALUES (?, ?, ?, ?)',
    'e1',
    'p1',
    '2026-09-01',
    '旧私密感受',
  )
  db.runSync(
    'INSERT INTO media (id, entry_id, place_id, local_display_path, sort_order) VALUES (?, ?, ?, ?, ?)',
    'm1',
    'e1',
    'p1',
    '/local/display.jpg',
    0,
  )
  db.runSync(
    'INSERT INTO tag_dimensions (id, name, kind) VALUES (?, ?, ?)',
    'd1',
    '地区',
    'region',
  )
  db.runSync(
    'INSERT INTO tags (id, dimension_id, name) VALUES (?, ?, ?)',
    't1',
    'd1',
    '海口',
  )
  db.runSync(
    'INSERT INTO share_snapshots (id, slug, kind, title, created_at) VALUES (?, ?, ?, ?, ?)',
    's1',
    'slug-old',
    'single',
    '旧快照',
    '2026-09-01T00:00:00.000Z',
  )
  db.runSync(
    'INSERT INTO share_items (snapshot_id, client_id, sort_order, place_name) VALUES (?, ?, ?, ?)',
    's1',
    'c1',
    0,
    '旧地点',
  )
  return db
}

describe('migrations: V3 批量补齐老库缺列（多列漂移 P0）', () => {
  it('新库每张表实际列与 EXPECTED_COLUMNS 全等（防 DDL 原地增列再漏补）', () => {
    const db = freshDb()
    runMigrations(db)

    for (const table of V1_TABLES) {
      expect(new Set(columnNames(db, table))).toEqual(new Set(EXPECTED_COLUMNS[table].map((c) => c.name)))
    }
  })

  it('老库缺多列；升级后全部应有列存在且旧行完整保留', () => {
    const db = legacyMultiDriftDb()
    for (const { table, column } of DRIFT_COLUMNS) {
      expect(columnNames(db, table)).not.toContain(column)
    }

    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(appliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version))
    for (const table of V1_TABLES) {
      expect(new Set(columnNames(db, table))).toEqual(new Set(EXPECTED_COLUMNS[table].map((c) => c.name)))
    }
    expect(db.getFirstSync('SELECT id, name, sync_error FROM places WHERE id = ?', 'p1')).toEqual({
      id: 'p1',
      name: '旧地点',
      sync_error: null,
    })
    expect(
      db.getFirstSync('SELECT id, note_private, cover_media_id, summary, sync_error FROM entries WHERE id = ?', 'e1'),
    ).toEqual({ id: 'e1', note_private: '旧私密感受', cover_media_id: null, summary: null, sync_error: null })
    expect(
      db.getFirstSync('SELECT id, local_display_path, remote_path, remote_thumb_path FROM media WHERE id = ?', 'm1'),
    ).toEqual({ id: 'm1', local_display_path: '/local/display.jpg', remote_path: null, remote_thumb_path: null })
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM share_items')?.n).toBe(1)
  })

  it('重复跑安全：列不重复、版本不前进、数据不丢', () => {
    const db = legacyMultiDriftDb()
    runMigrations(db)
    const before = columnNames(db, 'entries')

    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(columnNames(db, 'entries')).toEqual(before)
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n).toBe(1)
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM media')?.n).toBe(1)
  })

  it('升级后 Meine 状态汇总可读：无 sync_error 列的 tags 不再抛 no such column', () => {
    const db = legacyMultiDriftDb()
    runMigrations(db)
    db.runSync("UPDATE entries SET sync_status = 'failed' WHERE id = ?", 'e1')
    db.runSync("UPDATE tags SET sync_status = 'failed' WHERE id = ?", 't1')

    const summary = getSyncSummary(db)

    expect(summary.failedEntities).toEqual([
      { table: 'entries', id: 'e1', error: null },
      { table: 'tags', id: 't1', error: null },
    ])
  })

  it('REWORK4 老库（账本 v2、已有 cover_media_id 但缺 sync_error）再升 v3 补齐', () => {
    const db = freshDb()
    db.execSync(V1_TABLES_DDL)
    db.execSync('ALTER TABLE entries DROP COLUMN sync_error')
    db.execSync('ALTER TABLE places DROP COLUMN sync_error')
    db.execSync(MIGRATIONS_DDL)
    db.runSync(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`, 1, '2026-09-01T00:00:00.000Z')
    db.runSync(`INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`, 2, '2026-09-01T00:00:00.000Z')
    db.execSync('PRAGMA user_version = 2')
    db.runSync('INSERT INTO places (id, name) VALUES (?, ?)', 'p1', '旧地点')
    db.runSync('INSERT INTO entries (id, place_id, visit_date) VALUES (?, ?, ?)', 'e1', 'p1', '2026-09-01')

    const version = runMigrations(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(columnNames(db, 'places')).toContain('sync_error')
    expect(columnNames(db, 'entries')).toContain('sync_error')
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n).toBe(1)
  })
})

/** 毒账本：全表已建但缺 DRIFT_COLUMNS 多列，账本已记账 v1/v2/v3、user_version=3（列却没落）。 */
function poisonLedgerDb(): SqlDatabase {
  const db = freshDb()
  db.execSync(V1_TABLES_DDL)
  for (const { table, column } of DRIFT_COLUMNS) {
    db.execSync(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  }
  db.execSync(MIGRATIONS_DDL)
  for (const v of [1, 2, 3]) {
    db.runSync(
      `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`,
      v,
      '2026-09-01T00:00:00.000Z',
    )
  }
  db.execSync('PRAGMA user_version = 3')
  db.runSync('INSERT INTO places (id, name) VALUES (?, ?)', 'p1', '毒账本地点')
  db.runSync(
    'INSERT INTO entries (id, place_id, visit_date, note_private) VALUES (?, ?, ?, ?)',
    'e1',
    'p1',
    '2026-09-01',
    '毒账本私密感受',
  )
  return db
}

describe('REWORK6: 无条件列对账（initializeDatabase 每次启动恒跑，专治毒账本）', () => {
  it('毒账本（账本有 1/2/3 但列缺失）：版本门控跳过补列，启动后无条件对账把列全补', () => {
    const db = poisonLedgerDb()
    for (const { table, column } of DRIFT_COLUMNS) {
      expect(columnNames(db, table)).not.toContain(column)
    }

    // 版本已到 3：仅跑迁移链不会补列——这正是真机毒账本的成因。
    expect(runMigrations(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(columnNames(db, 'entries')).not.toContain('cover_media_id')

    const version = initializeDatabase(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    for (const table of V1_TABLES) {
      expect(new Set(columnNames(db, table))).toEqual(new Set(EXPECTED_COLUMNS[table].map((c) => c.name)))
    }
    // 对账不写账本版本号、不动 user_version、旧数据不丢。
    expect(appliedVersions(db)).toEqual([1, 2, 3])
    expect(getUserVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(db.getFirstSync<{ note_private: string }>('SELECT note_private FROM entries WHERE id = ?', 'e1')?.note_private).toBe(
      '毒账本私密感受',
    )
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n).toBe(1)
  })

  it('正常库列齐全：启动无变更，账本/user_version/列集合保持一致', () => {
    const db = freshDb()
    initializeDatabase(db)
    const before = {
      ledger: appliedVersions(db),
      userVersion: getUserVersion(db),
      columns: Object.fromEntries(V1_TABLES.map((t) => [t, columnNames(db, t)])),
    }

    const version = initializeDatabase(db)

    expect(version).toBe(LATEST_SCHEMA_VERSION)
    expect(appliedVersions(db)).toEqual(before.ledger)
    expect(getUserVersion(db)).toBe(before.userVersion)
    for (const table of V1_TABLES) {
      expect(columnNames(db, table)).toEqual(before.columns[table])
    }
  })

  it('reconcileExpectedColumns 幂等：缺列返回新增计数，列齐返回 0', () => {
    const db = poisonLedgerDb()

    expect(reconcileExpectedColumns(db)).toBe(DRIFT_COLUMNS.length)
    expect(reconcileExpectedColumns(db)).toBe(0)
  })
})
