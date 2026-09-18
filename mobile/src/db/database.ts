// 本地 SQLite 连接抽象（T014–T016 支撑层）。
//
// 目的：业务/迁移代码只依赖本文件的最小接口 `SqlDatabase`，不直接依赖 expo-sqlite。
// 好处：① 测试可用 node:sqlite（真实 SQLite 引擎）实现同一接口，真验 SQL 与事务回滚；
//       ② 未来若要换底层（expo-sqlite 版本/其它 adapter）不动上层。
//
// 接口只声明本项目用到的同步子集，`expo-sqlite` 的 `SQLiteDatabase` 结构上满足它。

/** SQLite 可绑定值（本项目不使用 Blob，Uint8Array 仅保留兼容）。 */
export type SqlValue = string | number | null | boolean | Uint8Array

export interface SqlRunResult {
  changes: number
  lastInsertRowId: number
}

/** 同步 SQL 连接的最小接口：与 expo-sqlite `SQLiteDatabase` 同形。 */
export interface SqlDatabase {
  execSync(source: string): void
  runSync(source: string, ...params: SqlValue[]): SqlRunResult
  getAllSync<T>(source: string, ...params: SqlValue[]): T[]
  getFirstSync<T>(source: string, ...params: SqlValue[]): T | null
  withTransactionSync(task: () => void): void
}

/**
 * 连接级 PRAGMA（T015）。
 * - `foreign_keys = ON`：让 FK/级联按 schema 生效（SQLite 默认关闭）。
 * - `journal_mode = WAL`：读写并发与崩溃安全；内存库会返回 memory，无副作用。
 * - `busy_timeout`：避免瞬时锁直接抛错。
 * 不使用 `synchronous = OFF` 等牺牲持久性的选项（R-05：真实数据不可丢）。
 */
export function applyConnectionPragmas(db: SqlDatabase): void {
  db.execSync('PRAGMA foreign_keys = ON')
  db.execSync('PRAGMA journal_mode = WAL')
  db.execSync('PRAGMA busy_timeout = 5000')
}
