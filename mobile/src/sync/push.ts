// Sync push 引擎本地段（T067；SDD T063–T067 的调度骨架，真网/字段映射留后续 Task）。
//
// 职责：
//   1. owner 前置门禁：绑定账号与当前账号不一致（或未绑定）时整体阻断，不认领、不发送；
//   2. 固定顺序：先 `releaseStaleClaims`（恢复进程被杀遗留的锁），再 `claim`；
//   3. dependsOn DAG 解锁：父成功（本次完成或历史 alreadyDone）才放子；父未成功时子保持
//      pending（释放回队列）且不计业务失败；缺父/成环抛 `PushDagError`；
//   4. 单 op 超时 + 整轮超时（push 默认 90s 量级，可配）；整轮超时把未处理的 claimed 归还；
//   5. 失败累加 attempts/last_error，5 次转 parked 停放 24h（outbox 既有语义）。
//
// 幂等键 = `outbox.op_id`：transport 收到稳定 opId；成功即 complete 删除，重复运行不重发。
// 已达成但已从 outbox 删除的父节点，可由调用方经 `alreadyDoneOpIds` 声明（重启续跑校准）。

import type { SqlDatabase } from '../db/database'
import { assertOwnerForSync } from '../supabase/owner'
import { getBoundOwner } from './meta'
import type { Outbox, OutboxRow } from './outbox'
import type { PushOpPayload, PushTransport, TransportResult } from './transport'

export const DEFAULT_PUSH_CONFIG = {
  /** 单 op 超时（ms）。 */
  singleOpTimeoutMs: 30_000,
  /** 整轮 push 超时（ms）。 */
  roundTimeoutMs: 90_000,
  /** 每轮最多认领条数。 */
  batchLimit: 100,
} as const

export interface PushConfig {
  singleOpTimeoutMs: number
  roundTimeoutMs: number
  batchLimit: number
}

/** 单 op 超时（dispatcher 计时，不依赖 transport 自觉）。 */
export class PushTimeoutError extends Error {
  readonly opId: string
  readonly timeoutMs: number

  constructor(opId: string, timeoutMs: number) {
    super(`push 单 op 超时：${opId} 超过 ${timeoutMs}ms`)
    this.name = 'PushTimeoutError'
    this.opId = opId
    this.timeoutMs = timeoutMs
  }
}

/** DAG 完整性错误：缺父（依赖的 op 从未存在）或成环。 */
export class PushDagError extends Error {
  readonly reason: 'missing_parent' | 'cycle'

  constructor(reason: 'missing_parent' | 'cycle', detail: string) {
    super(reason === 'missing_parent' ? `push DAG 缺父：${detail}` : `push DAG 成环：${detail}`)
    this.name = 'PushDagError'
    this.reason = reason
  }
}

export interface PushRunInput {
  /** 当前登录账号 id（owner 门禁用）。 */
  currentUserId: string | null | undefined
  /** 已确认达成、但已从 outbox 删除的父 op（重启续跑）。 */
  alreadyDoneOpIds?: Iterable<string>
}

export interface PushRunResult {
  /** 本轮成功完成的 op_id。 */
  done: string[]
  /** 本轮失败、仍未达阈值（回 pending）的 op_id。 */
  failed: string[]
  /** 本轮失败达到阈值、转 parked 的 op_id。 */
  parked: string[]
  /** 父未成功而阻塞、已归还队列的 op_id。 */
  blocked: string[]
  /** 整轮超时未处理、已归还队列的 op_id。 */
  released: string[]
  /** 是否触发整轮超时。 */
  timedOut: boolean
}

export interface PushEngineDeps {
  db: SqlDatabase
  outbox: Outbox
  transport: PushTransport
  config?: Partial<PushConfig>
  now?: () => number
}

export interface PushEngine {
  run(input: PushRunInput): Promise<PushRunResult>
}

function parseDependsOn(row: OutboxRow): string[] {
  if (!row.depends_on) return []
  try {
    const parsed = JSON.parse(row.depends_on) as unknown
    return Array.isArray(parsed) ? (parsed.filter((d) => typeof d === 'string') as string[]) : []
  } catch {
    return []
  }
}

function payloadFromRow(row: OutboxRow): PushOpPayload {
  return {
    opId: row.op_id,
    kind: row.kind,
    entityId: row.entity_id ?? undefined,
    entityIds: row.entity_ids ? (JSON.parse(row.entity_ids) as string[]) : undefined,
    dependsOn: parseDependsOn(row),
  }
}

function formatError(result: TransportResult): string {
  const base = result.error ?? result.outcome
  const steps = result.completedSteps
  return steps && steps.length > 0 ? `${base}（已完成：${steps.join(', ')}）` : base
}

/** 给 transport 调用加单 op 超时；超时抛 `PushTimeoutError`。 */
async function withTimeout<T>(promise: Promise<T>, ms: number, opId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PushTimeoutError(opId, ms)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 对 claimed 行按 in-batch 依赖做拓扑排序（Kahn）。
 * 外部依赖（不在本批）不参与定序，由运行时 `completed` 判定是否阻塞。
 * 成环抛 `PushDagError`。
 */
function topoSort(rows: OutboxRow[]): OutboxRow[] {
  const byId = new Map(rows.map((r) => [r.op_id, r]))
  const indegree = new Map<string, number>()
  const children = new Map<string, string[]>()
  for (const row of rows) indegree.set(row.op_id, 0)
  for (const row of rows) {
    for (const dep of parseDependsOn(row)) {
      if (!byId.has(dep)) continue
      indegree.set(row.op_id, (indegree.get(row.op_id) ?? 0) + 1)
      const list = children.get(dep) ?? []
      list.push(row.op_id)
      children.set(dep, list)
    }
  }

  const queue = rows.filter((r) => (indegree.get(r.op_id) ?? 0) === 0).map((r) => r.op_id)
  const ordered: string[] = []
  while (queue.length > 0) {
    const id = queue.shift() as string
    ordered.push(id)
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1
      indegree.set(child, next)
      if (next === 0) queue.push(child)
    }
  }

  if (ordered.length !== rows.length) {
    const cycle = rows.map((r) => r.op_id).filter((id) => !ordered.includes(id))
    throw new PushDagError('cycle', cycle.join(' -> '))
  }
  const rank = new Map(ordered.map((id, index) => [id, index]))
  return [...rows].sort((a, b) => (rank.get(a.op_id) ?? 0) - (rank.get(b.op_id) ?? 0))
}

export function createPushEngine(deps: PushEngineDeps): PushEngine {
  const config: PushConfig = { ...DEFAULT_PUSH_CONFIG, ...deps.config }
  const now = deps.now ?? (() => Date.now())

  return {
    async run(input) {
      // 1) owner 前置门禁：不匹配/未绑定整体阻断（不认领、不发送）。
      assertOwnerForSync(getBoundOwner(deps.db) ?? null, input.currentUserId ?? null)

      const deadline = now() + config.roundTimeoutMs

      // 2) 固定顺序：先恢复陈旧锁，再认领。
      deps.outbox.releaseStaleClaims()
      const claimed = deps.outbox.claim(config.batchLimit)

      const done: string[] = []
      const failed: string[] = []
      const parked: string[] = []
      const blocked: string[] = []
      const released: string[] = []
      let timedOut = false

      if (claimed.length === 0) {
        return { done, failed, parked, blocked, released, timedOut }
      }

      const completed = new Set<string>(input.alreadyDoneOpIds ?? [])
      const inBatch = new Set(claimed.map((r) => r.op_id))

      try {
        // 3a) 缺父即报错（整批前置校验，先于任何发送）。
        for (const row of claimed) {
          for (const dep of parseDependsOn(row)) {
            if (completed.has(dep) || inBatch.has(dep)) continue
            if (!deps.outbox.get(dep)) throw new PushDagError('missing_parent', `${row.op_id} -> ${dep}`)
          }
        }
        // 3b) 成环报错。
        const order = topoSort(claimed)

        // 4) 按 DAG 顺序执行；父成功后子才可跑（运行时以 completed 判定）。
        for (let i = 0; i < order.length; i++) {
          const row = order[i]
          if (now() >= deadline) {
            timedOut = true
            for (const rest of order.slice(i)) {
              deps.outbox.release(rest.op_id)
              released.push(rest.op_id)
            }
            break
          }

          const depIds = parseDependsOn(row)
          if (depIds.some((dep) => !completed.has(dep))) {
            deps.outbox.release(row.op_id)
            blocked.push(row.op_id)
            continue
          }

          let result: TransportResult
          try {
            result = await withTimeout(deps.transport.send(payloadFromRow(row)), config.singleOpTimeoutMs, row.op_id)
          } catch (error) {
            result = { outcome: 'retry', error: error instanceof Error ? error.message : String(error) }
          }

          if (result.outcome === 'ok') {
            deps.outbox.complete(row.op_id)
            completed.add(row.op_id)
            done.push(row.op_id)
          } else {
            const after = deps.outbox.fail(row.op_id, formatError(result))
            if (after?.status === 'parked') parked.push(row.op_id)
            else failed.push(row.op_id)
          }
        }

        return { done, failed, parked, blocked, released, timedOut }
      } catch (error) {
        // 完整性错误等：归还本次仍处于 claimed 的行，避免卡死（已 complete 的行已删除，failed 的已回 pending）。
        for (const row of claimed) {
          if (deps.outbox.get(row.op_id)?.status === 'claimed') deps.outbox.release(row.op_id)
        }
        throw error
      }
    },
  }
}
