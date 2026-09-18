// forward-only migration runner（T015/T016；R-05）。
//
// 规则（PRODUCT_PLAN V1.5 / SDD PLAN §6）：
//   1. 只允许向前迁移：库版本高于代码支持的最高版本时抛错，绝不执行“降级”或删库重建。
//   2. 每个版本一个 up 脚本，按版本号升序、逐版执行；每版包在自己的事务里，
//      失败即回滚（DDL 与账本同成或同败），失败后库保持原状、版本不前进。
//   3. 账本 `schema_migrations` 为主，`PRAGMA user_version` 同步保留以便外部工具识别。
//   4. 幂等：重复调用已迁移完成的新库为 no-op，不丢数据。
//
// 注意：迁移只做结构演进；第一版建表见 `schema.ts`。

import type { SqlDatabase } from './database'
import { EXPECTED_COLUMNS, MIGRATIONS_DDL, SCHEMA_MIGRATIONS_TABLE, V1_TABLES, V1_TABLES_DDL } from './schema'

export interface Migration {
  /** 从 1 开始的正整数，必须唯一且连续。 */
  version: number
  name: string
  up(db: SqlDatabase): void
}

/** 版本账本写入格式（`schema_migrations` 行）。 */
export interface MigrationLedgerRow {
  version: number
  applied_at: string
}

/** 库版本高于代码支持版本：说明装过更新版本 App，禁止继续（R-05 误报为升级）。 */
export class MigrationDowngradeError extends Error {
  constructor(current: number, supported: number) {
    super(`数据库版本 v${current} 高于当前 App 支持的最高版本 v${supported}，禁止降级迁移`)
    this.name = 'MigrationDowngradeError'
  }
}

/** 账本与迁移清单不一致（缺号/未知版本）：无法安全前进。 */
export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationIntegrityError'
  }
}

/**
 * V1 首个版本：建 11 张业务表 + 索引。
 * 纯 `CREATE TABLE/INDEX IF NOT EXISTS`，可安全重复执行；不删任何数据（R-05）。
 */
export const MIGRATION_001_INITIAL: Migration = {
  version: 1,
  name: 'initial-local-schema',
  up(db) {
    db.execSync(V1_TABLES_DDL)
  },
}

/** 列是否已存在（`PRAGMA table_info`）。 */
function columnExists(db: SqlDatabase, table: string, column: string): boolean {
  return db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${table})`)
    .some((c) => c.name === column)
}

/**
 * 补列（forward-only，R-05）：已存在则 no-op；否则 `ALTER TABLE ... ADD COLUMN`。
 * 只加列、不删列、不改既有行；先判存在，重复执行安全。
 * @returns 是否真的新增了一列（供无条件对账统计，调用方可忽略）。
 */
function addColumnIfMissing(db: SqlDatabase, table: string, column: string, definition: string): boolean {
  if (columnExists(db, table, column)) return false
  db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  return true
}

/** 表是否存在（`sqlite_master`）。 */
function tableExists(db: SqlDatabase, table: string): boolean {
  return (
    db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      table,
    ) != null
  )
}

/**
 * V2：老库缺 `entries.cover_media_id`（真机实证 P0：画廊查询引用该列致白屏）。
 *
 * 老库由更早的 V1 DDL 建表，`CREATE TABLE IF NOT EXISTS` 命中已存在表时不会补列，
 * 导致新查询层（`features/queries.ts` ENTRY_SELECT）引用该列直接 SQL 报错。
 * 此处用 ALTER TABLE 显式补列，先 `PRAGMA table_info` 判存在再加，幂等且不丢数据。
 */
export const MIGRATION_002_ENTRIES_COVER_MEDIA_ID: Migration = {
  version: 2,
  name: 'entries-add-cover-media-id',
  up(db) {
    addColumnIfMissing(db, 'entries', 'cover_media_id', 'TEXT')
  },
}

/**
 * 无条件全表全列对账（REWORK6）：以当前 latest DDL（`EXPECTED_COLUMNS`）为准，逐表逐列
 * `PRAGMA table_info` 判存在，缺列即 `ALTER TABLE ... ADD COLUMN`。
 *
 * 与版本链解耦，专治「毒账本」：真机上 `schema_migrations` 已记账 v1/v2/v3，但设备实际
 * 列仍缺失（版本门控会把补列逻辑跳过）。因此本函数：
 *   - 不读/不写 `schema_migrations`、不改 `PRAGMA user_version`，无版本号语义；
 *   - 每次启动恒定执行一遍，列齐全时零改动（幂等，R-05 forward-only）；
 *   - 表不存在时跳过（建表由 V1 负责，这里只审计列，绝不删库/重建）。
 *
 * @returns 本次新增列数（0 表示无变更），仅供启动 debug 日志。
 */
export function reconcileExpectedColumns(db: SqlDatabase): number {
  let added = 0
  for (const table of V1_TABLES) {
    if (!tableExists(db, table)) continue
    for (const column of EXPECTED_COLUMNS[table]) {
      if (addColumnIfMissing(db, table, column.name, column.definition)) added += 1
    }
  }
  return added
}

/**
 * V3：以当前 latest DDL（`EXPECTED_COLUMNS`）为准，逐表逐列批量补齐老库缺列。
 *
 * 真机老库由更早的 DDL 建表，`CREATE TABLE IF NOT EXISTS` 命中已存在表时不补列；
 * 后续在 V1 DDL 里原地新增的列（`cover_media_id`、`sync_error`、`summary`、`remote_path`…）
 * 都没有递增 migration 版本号，导致老库缺列、查询层报 `no such column`（Meine 页 P0）。
 * 逐列先 `PRAGMA table_info` 判存在，缺才 `ALTER TABLE ... ADD COLUMN`；只加列、不删列、
 * 不改既有行，重复执行安全（R-05 forward-only）。逻辑与无条件对账同源。
 */
export const MIGRATION_003_RECONCILE_EXPECTED_COLUMNS: Migration = {
  version: 3,
  name: 'reconcile-missing-columns',
  up(db) {
    reconcileExpectedColumns(db)
  },
}

/** 迁移清单（升序）。后续版本追加在此，禁止改动已发布版本的语义。 */
export const MIGRATIONS: readonly Migration[] = [
  MIGRATION_001_INITIAL,
  MIGRATION_002_ENTRIES_COVER_MEDIA_ID,
  MIGRATION_003_RECONCILE_EXPECTED_COLUMNS,
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)

function nowIso(): string {
  return new Date().toISOString()
}

function ensureLedger(db: SqlDatabase): void {
  db.execSync(MIGRATIONS_DDL)
}

/** 读账本已应用版本（升序）。 */
export function appliedVersions(db: SqlDatabase): number[] {
  ensureLedger(db)
  return db
    .getAllSync<{ version: number }>(`SELECT version FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY version ASC`)
    .map((r) => r.version)
}

/** 读 `PRAGMA user_version`（0 表示从未迁移）。 */
export function getUserVersion(db: SqlDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')
  return row?.user_version ?? 0
}

function setUserVersion(db: SqlDatabase, version: number): void {
  if (!Number.isInteger(version) || version < 0) throw new Error(`非法 user_version: ${version}`)
  db.execSync(`PRAGMA user_version = ${version}`)
}

/**
 * 账本与 user_version 对账。
 * - 旧库只有 user_version（早期实现）→ 以 user_version 为准补账本 k=1..n 行。
 * - 账本有值而 user_version 落后 → 以账本最大值为准回写 user_version。
 * 两边都是 0 → 全新库，不需要处理。
 */
function reconcileVersionState(db: SqlDatabase, migrations: readonly Migration[]): number {
  const ledger = appliedVersions(db)
  const userVersion = getUserVersion(db)

  if (ledger.length === 0 && userVersion === 0) return 0

  const supported = new Set(migrations.map((m) => m.version))
  const supportedMax = migrations.reduce((max, m) => Math.max(max, m.version), 0)
  const unknown = ledger.filter((v) => !supported.has(v))
  if (unknown.length > 0) {
    throw new MigrationIntegrityError(`账本包含代码不认识的版本 ${unknown.join(',')}，禁止继续迁移`)
  }
  if (ledger.length === 0 && userVersion > supportedMax) {
    // 旧库 user_version 超出支持范围：先报降级错误，禁止写账本
    throw new MigrationDowngradeError(userVersion, supportedMax)
  }

  if (ledger.length === 0 && userVersion > 0) {
    // 兼容：把 1..userVersion 记为已应用，避免重复执行早期 up 脚本
    for (let v = 1; v <= userVersion; v++) {
      db.runSync(`INSERT OR IGNORE INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`, v, nowIso())
    }
    return userVersion
  }

  const maxLedger = ledger[ledger.length - 1]
  if (maxLedger !== userVersion) setUserVersion(db, maxLedger)
  return maxLedger
}

/**
 * 执行所有未应用迁移，返回迁移后的库版本。
 * 幂等：全部已应用时返回当前版本且不写库。
 */
export function runMigrations(db: SqlDatabase, migrations: readonly Migration[] = MIGRATIONS): number {
  if (migrations.length === 0) return 0
  ensureLedger(db)

  const supportedMax = migrations.reduce((max, m) => Math.max(max, m.version), 0)
  const sorted = [...migrations].sort((a, b) => a.version - b.version)

  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1
    if (sorted[i].version !== expected) {
      throw new MigrationIntegrityError(`迁移清单版本必须从 1 连续：期望 ${expected}，实际 ${sorted[i].version}`)
    }
  }

  let current = reconcileVersionState(db, sorted)
  if (current > supportedMax) throw new MigrationDowngradeError(current, supportedMax)

  for (const migration of sorted) {
    if (migration.version <= current) continue
    db.withTransactionSync(() => {
      migration.up(db)
      db.runSync(
        `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE}(version, applied_at) VALUES(?, ?)`,
        migration.version,
        nowIso(),
      )
      setUserVersion(db, migration.version)
    })
    current = migration.version
  }

  return current
}

/** 当前库版本（仅对账，不执行迁移）。 */
export function currentSchemaVersion(db: SqlDatabase, migrations: readonly Migration[] = MIGRATIONS): number {
  return reconcileVersionState(db, migrations)
}
