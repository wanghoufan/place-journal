// App 级单例仓库（业务 UI 入口）。
//
// 唯一库连接由 `db/index.ts` 打开；这里只做一次惰性初始化并复用一个 Repository，
// 避免每个页面各自 openDatabaseSync。测试不依赖本文件（直接用内存库 + createRepository）。

import { openAppDatabase, type AppDatabase } from './index'
import { createRepository, type Repository } from './repository'

export interface AppRepository {
  db: AppDatabase
  repo: Repository
}

let cached: AppRepository | null = null

export function getAppRepository(): AppRepository {
  if (!cached) {
    const db = openAppDatabase()
    cached = { db, repo: createRepository(db) }
  }
  return cached
}
