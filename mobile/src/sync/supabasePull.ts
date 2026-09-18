// 真网 PullSource（TASK-DEV-08；SDD 真接线段 / T063+ 拉取）。
//
// 从 `habit_tracker` 分页拉取 4 张带 revision 的核心实体表（places/entries/
// tag_dimensions/tags），组装成与 `RemoteSnapshot` 同形的快照，交给 `pull.ts`
// 既有 merge（dirty guard / 冲突 / 删除防复活）落盘——本文件不重复合并逻辑。
//
// 分页：按 id 升序 `range(offset, offset + limit - 1)` 翻页，直到某页不足一页；
// 排序稳定保证跨页不重不漏。真客户端经 `SyncGateway` 注入，单测用录制型 fake。

import { DB_SCHEMA, type SyncGateway } from './gateway'
import type { PullSource, RemoteEntityRow, RemoteSnapshot } from './pull'

export const DEFAULT_PULL_PAGE_SIZE = 1000

const PULL_TABLES = ['places', 'entries', 'tag_dimensions', 'tags'] as const

export interface SupabasePullSourceDeps {
  gateway: SyncGateway
  pageSize?: number
}

async function fetchAllRows(
  gateway: SyncGateway,
  table: string,
  pageSize: number,
): Promise<RemoteEntityRow[]> {
  const rows: RemoteEntityRow[] = []
  for (let offset = 0; ; offset += pageSize) {
    const res = await gateway.select(table, {
      columns: '*',
      orderBy: { column: 'id', ascending: true },
      limit: pageSize,
      offset,
    })
    if (res.error) throw new Error(`${DB_SCHEMA}.${table} 拉取失败：${res.error.message}`)
    const page = (res.data ?? []) as RemoteEntityRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export function createSupabasePullSource(deps: SupabasePullSourceDeps): PullSource {
  const pageSize = deps.pageSize ?? DEFAULT_PULL_PAGE_SIZE
  if (pageSize <= 0) throw new Error('pull pageSize 必须为正整数')

  return {
    async fetchAll(): Promise<RemoteSnapshot> {
      const snapshot: RemoteSnapshot = {}
      for (const table of PULL_TABLES) {
        snapshot[table] = await fetchAllRows(deps.gateway, table, pageSize)
      }
      return snapshot
    },
  }
}
