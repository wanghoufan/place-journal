// Sync pull 引擎本地段（TASK-DEV-07；SDD T063+ 拉取骨架，真网/凭据留后续 Task）。
//
// 职责（对齐 Web `src/lib/sync.ts` 的 `pullRemote` / `respectFreshEdits` 语义）：
//   1. owner 前置门禁：绑定账号与当前账号不一致（或未绑定）整体阻断，不拉取、不落盘；
//   2. outbox 非空守卫：存在未确认（pending/claimed）op 时不拉取，避免覆盖待推本地写入；
//      已停放（parked，push 已放弃）op 不再算未确认、不永久阻塞 pull（对齐「push 失败不
//      永久阻塞 pull」），其删除语义改由第 4 条按实体删除标记防复活兜底；
//   3. 远端行按 revision 合并：
//        - 本地缺失 → 采纳远端（base=revision，synced）；
//        - 本地 dirty（非 synced 或 revision≠base）→ 不被覆盖：
//            · 远端 revision 仍在共同 base → 仅本地前进，protected；
//            · 远端 revision 已越过 base → 双方分叉，落 conflicts 表（内容保留本地）；
//        - 本地 clean 且远端 revision 更新 → 更新本地并推进 base；
//   4. 删除防复活：本地存在 `delete_place`/`delete_entry`/`delete_tags` 标记（含已停放）时，
//      远端同名行不落本地（对齐 delete_* 语义；远端行缺失也不删除本地，pull 从不删本地行）；
//   5. 拉取独立超时（默认 30s，可配）；超时不落盘、下轮再拉。
//
// 真实现（PostgREST `select *` 8 表）后续 Task 按合同映射成 `RemoteSnapshot` 后接入，
// dispatcher 不改。

import type { SqlDatabase } from '../db/database'
import { assertOwnerForSync } from '../supabase/owner'
import { addConflictRecord, findOpenConflict } from './conflicts'
import {
  CORE_ENTITY_BINDINGS,
  baseRevisionOf,
  isDirtyRow,
  markLocalConflict,
  remoteRowToLocalRow,
  upsertLocalRow,
  type ConflictEntityKind,
  type LocalRow,
} from './merge'
import { getBoundOwner } from './meta'
import { createOutbox, type Outbox } from './outbox'

export const DEFAULT_PULL_CONFIG = {
  /** 拉取整轮超时（ms）；超时不落盘、下轮再拉。 */
  timeoutMs: 30_000,
} as const

export interface PullConfig {
  timeoutMs: number
}

/** 拉取超时（dispatcher 计时，不依赖 source 自觉）。 */
export class PullTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`pull 超时：超过 ${timeoutMs}ms`)
    this.name = 'PullTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/** 远端核心实体行（snake_case 线合同 + revision）。 */
export interface RemoteEntityRow {
  id: string
  revision: number
  updated_at?: string
  [key: string]: unknown
}

/** 一次拉取的远端快照（mock 与真实现同形）。 */
export type RemoteSnapshot = Partial<
  Record<'places' | 'entries' | 'tag_dimensions' | 'tags', RemoteEntityRow[]>
>

export interface PullSource {
  fetchAll(): Promise<RemoteSnapshot>
}

export interface PullRunInput {
  /** 当前登录账号 id（owner 门禁用）。 */
  currentUserId?: string | null
}

export type PullSkipReason = 'outbox' | 'timeout'

export interface PullResult {
  /** 本轮是否未合并（outbox 守卫或超时）。 */
  skipped: boolean
  skipReason: PullSkipReason | null
  /** 是否触发拉取超时。 */
  timedOut: boolean
  /** 采纳/更新的行数（远端插入 + 新 revision 覆盖）。 */
  applied: number
  /** dirty 保护、未被远端覆盖的行数。 */
  protectedCount: number
  /** 本轮新登记的分叉冲突数。 */
  conflicts: number
  /** 因本地删除标记而未被远端复活的行数。 */
  noRevival: number
}

export interface PullEngineDeps {
  db: SqlDatabase
  source: PullSource
  config?: Partial<PullConfig>
  outbox?: Outbox
  now?: () => number
}

export interface PullEngine {
  run(input?: PullRunInput): Promise<PullResult>
}

const EMPTY_RESULT: PullResult = {
  skipped: false,
  skipReason: null,
  timedOut: false,
  applied: 0,
  protectedCount: 0,
  conflicts: 0,
  noRevival: 0,
}

function skippedResult(reason: PullSkipReason): PullResult {
  return { ...EMPTY_RESULT, skipped: true, skipReason: reason, timedOut: reason === 'timeout' }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 给 source.fetchAll 加整轮超时；超时抛 `PullTimeoutError`。 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new PullTimeoutError(ms))
    }, ms)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const DELETE_OP_BY_KIND: Partial<Record<ConflictEntityKind, string>> = {
  place: 'delete_place',
  entry: 'delete_entry',
  tag: 'delete_tags',
}

/** 本地是否存在针对该实体的删除 op 标记（pending/claimed/parked 均算；防远端复活）。 */
function hasDeleteMarker(db: SqlDatabase, kind: ConflictEntityKind, entityId: string): boolean {
  const opKind = DELETE_OP_BY_KIND[kind]
  if (!opKind) return false
  const rows = db.getAllSync<{ entity_id: string | null; entity_ids: string | null }>(
    'SELECT entity_id, entity_ids FROM outbox WHERE kind = ?',
    opKind,
  )
  for (const row of rows) {
    if (row.entity_id === entityId) return true
    if (row.entity_ids) {
      try {
        const ids = JSON.parse(row.entity_ids) as unknown
        if (Array.isArray(ids) && ids.includes(entityId)) return true
      } catch {
        // 忽略损坏的 entity_ids
      }
    }
  }
  return false
}

export function createPullEngine(deps: PullEngineDeps): PullEngine {
  const config: PullConfig = { ...DEFAULT_PULL_CONFIG, ...deps.config }
  const outbox = deps.outbox ?? createOutbox(deps.db)
  const now = deps.now ?? (() => Date.now())

  return {
    async run(input = {}) {
      // 1) owner 前置门禁：不匹配/未绑定整体阻断（不拉取、不落盘）。
      assertOwnerForSync(getBoundOwner(deps.db) ?? null, input.currentUserId ?? null)

      // 2) outbox 非空守卫：有未确认 op 时跳过拉取（未确认写入保护）。
      if (outbox.pendingCount() > 0) return skippedResult('outbox')

      // 3) 拉取（独立超时）。
      let snapshot: RemoteSnapshot
      try {
        snapshot = await withTimeout(deps.source.fetchAll(), config.timeoutMs)
      } catch (error) {
        if (error instanceof PullTimeoutError) return skippedResult('timeout')
        throw error
      }

      const result: PullResult = { ...EMPTY_RESULT }
      const ts = new Date(now()).toISOString()

      // 4) 单事务合并（全成或全败，避免半拉状态）。
      deps.db.withTransactionSync(() => {
        for (const binding of CORE_ENTITY_BINDINGS) {
          const remoteRows = snapshot[binding.table]
          if (!remoteRows || remoteRows.length === 0) continue

          const locals = deps.db.getAllSync<LocalRow>(`SELECT * FROM ${binding.table}`)
          const byId = new Map(locals.map((row) => [String(row.id), row]))

          for (const remote of remoteRows) {
            const id = String(remote.id)
            const remoteRevision = typeof remote.revision === 'number' ? remote.revision : 0

            // 4a) 本地删除标记 → 不复活。
            if (hasDeleteMarker(deps.db, binding.kind, id)) {
              result.noRevival += 1
              continue
            }

            const local = byId.get(id)
            if (!local) {
              // 4b) 本地缺失 → 采纳远端。
              upsertLocalRow(deps.db, binding.table, remoteRowToLocalRow(binding.table, remote))
              result.applied += 1
              continue
            }

            const base = baseRevisionOf(local)
            if (isDirtyRow(local)) {
              // 4c) dirty 保护；远端已越过共同 base → 分叉冲突。
              if (remoteRevision > base) {
                if (!findOpenConflict(deps.db, binding.kind, id)) {
                  addConflictRecord(deps.db, {
                    entityId: id,
                    entityKind: binding.kind,
                    expectedRevision: base,
                    localSnapshot: { ...local },
                    remoteSnapshot: remote,
                    now: ts,
                  })
                  markLocalConflict(deps.db, binding.table, id)
                  result.conflicts += 1
                }
              } else {
                result.protectedCount += 1
              }
              continue
            }

            // 4d) clean 且远端更新 → 覆盖并推进 base。
            if (remoteRevision > base) {
              upsertLocalRow(deps.db, binding.table, remoteRowToLocalRow(binding.table, remote))
              result.applied += 1
            }
          }
        }
      })

      return result
    },
  }
}

// ── mock 远端源（不触网、无凭据；单测/本地自检用）──────────────────────────

export interface MockPullSourceOptions {
  /** 模拟慢请求；配小超时即可触发拉取超时。 */
  delayMs?: number
}

export interface MockPullSource extends PullSource {
  readonly calls: number
  reset(): void
}

/**
 * 可编排 mock 远端源：`snapshot` 可为静态快照或按调用返回（异步）快照。
 */
export function createMockPullSource(
  snapshot: RemoteSnapshot | (() => RemoteSnapshot | Promise<RemoteSnapshot>),
  options: MockPullSourceOptions = {},
): MockPullSource {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    reset() {
      calls = 0
    },
    async fetchAll() {
      calls += 1
      if (options.delayMs && options.delayMs > 0) await delay(options.delayMs)
      return typeof snapshot === 'function' ? await snapshot() : snapshot
    },
  }
}
