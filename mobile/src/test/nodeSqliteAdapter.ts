// 测试用 SqlDatabase 适配器：node:sqlite（Node 内置真实 SQLite 引擎）。
//
// 为什么不用 mock：迁移幂等与事务回滚必须在真实 SQL 引擎上验证才有意义。
// 本文件只在测试中 import（`src/db/__tests__` / `src/sync/__tests__`），
// 不进入 App 运行时代码路径。

import { DatabaseSync } from 'node:sqlite'

import type { SqlDatabase, SqlRunResult, SqlValue } from '../db/database'

function toBindable(value: SqlValue): string | number | null | Uint8Array {
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

function toPlain<T>(row: unknown): T | null {
  if (row == null) return null
  return { ...(row as Record<string, unknown>) } as T
}

/** 打开内存 SQLite（默认）并返回实现 `SqlDatabase` 的适配器。 */
export function createNodeSqliteDatabase(location = ':memory:'): SqlDatabase {
  const db = new DatabaseSync(location)
  db.exec('PRAGMA foreign_keys = ON')

  let depth = 0

  return {
    execSync(source) {
      db.exec(source)
    },

    runSync(source, ...params) {
      const result = db.prepare(source).run(...params.map(toBindable))
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      } satisfies SqlRunResult
    },

    getAllSync<T>(source: string, ...params: SqlValue[]) {
      const rows = db.prepare(source).all(...params.map(toBindable))
      return rows.map((row) => toPlain<T>(row) as T)
    },

    getFirstSync<T>(source: string, ...params: SqlValue[]) {
      const row = db.prepare(source).get(...params.map(toBindable))
      return toPlain<T>(row)
    },

    withTransactionSync(task) {
      const nested = depth > 0
      const savepoint = `sp_${depth}`
      db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN')
      depth += 1
      try {
        task()
        if (nested) {
          db.exec(`RELEASE ${savepoint}`)
        } else {
          db.exec('COMMIT')
        }
      } catch (error) {
        if (nested) {
          db.exec(`ROLLBACK TO ${savepoint}`)
          db.exec(`RELEASE ${savepoint}`)
        } else {
          db.exec('ROLLBACK')
        }
        throw error
      } finally {
        depth -= 1
      }
    },
  }
}
