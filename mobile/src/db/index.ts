// 本地库入口（T015）：打开 expo-sqlite、连接级 PRAGMA、跑 forward-only 迁移。
//
// 业务代码从这里拿唯一库连接；禁止在别处直接 openDatabaseSync。
// 迁移失败时：错误上抛、连接保留（不删库/不重建），由上层阻止正常业务写入（R-05）。
//
// 本文件是 `mobile/src/db` 中唯一依赖 expo-sqlite 的文件；其余模块只依赖
// `./database` 的抽象，便于用 node:sqlite 在单测里跑真实 SQL。

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'

import { applyConnectionPragmas, type SqlDatabase } from './database'
import { reconcileExpectedColumns, runMigrations } from './migrations'
import { setMeta } from '../sync/meta'

export const APP_DB_NAME = 'place-journal.db'

export type AppDatabase = SqlDatabase

/**
 * 打开（或创建）本地库并完成迁移。
 * @param name 数据库文件名，测试/多账本场景可覆盖。
 */
export function openAppDatabase(name: string = APP_DB_NAME): AppDatabase {
  const db = openDatabaseSync(name)
  initializeDatabase(db)
  return db as SQLiteDatabase & SqlDatabase
}

/**
 * 对已打开的连接做初始化：PRAGMA → 版本迁移 → 无条件列对账。
 * 拆出来便于测试或复用已持有连接（expo-sqlite 连接单例）。
 *
 * 列对账与版本链解耦：每次启动除跑未应用版本迁移外，恒跑一遍 `EXPECTED_COLUMNS` 全表
 * 全列 `PRAGMA` 对账，缺列即补（幂等、不写账本版本号）。专治「账本已标 v1/v2/v3 但设备
 * 实际缺列」的毒账本——版本门控跳过的补列，这里无条件兜住。
 */
export function initializeDatabase(db: SqlDatabase): number {
  applyConnectionPragmas(db)
  const version = runMigrations(db)
  const reconciled = reconcileExpectedColumns(db)
  console.debug(`[db] expected-columns reconcile: +${reconciled}`)
  setMeta(db, 'db_version', version)
  return version
}

export { applyConnectionPragmas } from './database'
export type { SqlDatabase, SqlValue, SqlRunResult } from './database'
export {
  runMigrations,
  currentSchemaVersion,
  reconcileExpectedColumns,
  LATEST_SCHEMA_VERSION,
} from './migrations'
export type { Migration, MigrationLedgerRow } from './migrations'
export * from './schema'
