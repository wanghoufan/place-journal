// 同步入口接线（TASK-DEV-补线）：把真网 push/pull 引擎接到 UI 入口，让 owner 阻断端到端可见。
//
// 纯逻辑：引擎工厂由调用方注入（App 传 `createNativeSyncEngines`），本文件不 import
// Expo/Supabase 原生模块，单测直接注入 mock transport/source。
//
// 口径（基线 PRODUCT_PLAN_V1.5 + `features/account.ts`）：
//   - 未配置云端 / 未登录：静默跳过，不算错误；
//   - owner 未绑定：不给「已开始同步」，走 `describeUnboundHint()` 阻断；
//   - owner mismatch：只给阻断原因＋重登原账号（`describeOwnerMismatch`），不自动迁移、不跨号切号；
//   - 门禁与实际发送同源：UI 用 `ownerGateForSync` 判定，push/pull 内部用 `assertOwnerForSync`
//     同一判定，绝不出现「说同步了但没同步」；
//   - 退出登录只清 auth 态：本入口在 `signed_out` 时直接跳过，不碰业务数据、不发起任何请求。

import type { LoginState } from '../supabase/auth'
import { getBoundOwner, acquireSyncLock, releaseSyncLock, setLastSyncAt, setLastSyncResult } from '../sync/meta'
import { createOutbox, type Outbox } from '../sync/outbox'
import { OwnerBindingBlockedError, ownerGateForSync, type OwnerBindingState } from '../supabase/owner'
import { createPullEngine, type PullResult, type PullSource } from '../sync/pull'
import { createPushEngine, type PushRunResult } from '../sync/push'
import type { PushTransport } from '../sync/transport'
import type { SqlDatabase } from '../db/database'
import { describeOwnerMismatch, describeUnboundHint } from './account'

/** 真网 push/pull 引擎依赖（与 `sync/nativeSync.ts` 的 `NativeSyncEngines` 同形）。 */
export interface SyncEngines {
  owner: string
  transport: PushTransport
  source: PullSource
}

export interface SyncEntryDeps {
  db: SqlDatabase
  /** 当前登录态（Mine 的 `getLoginState()`；`null`＝未知，按未登录处理）。 */
  loginState: LoginState | null
  /** 云端是否已配置（`isSupabaseConfigured()`）；未配置不发起任何请求。 */
  isConfigured: boolean
  /** 引擎工厂：App 传 `createNativeSyncEngines`，单测注入 mock。 */
  createEngines: () => SyncEngines
  outbox?: Outbox
  now?: () => number
}

export type SyncEntrySkipReason = 'not_configured' | 'signed_out' | 'in_flight'

export type SyncEntryResult =
  | { status: 'ok'; owner: string; push: PushRunResult; pull: PullResult }
  | { status: 'blocked'; reason: 'unbound' | 'mismatch'; message: string }
  | { status: 'skipped'; reason: SyncEntrySkipReason; message: string }
  | { status: 'error'; message: string }

export const SYNC_NOT_CONFIGURED_MESSAGE = '云端未配置，未发起同步。'
export const SYNC_SIGNED_OUT_MESSAGE = '未登录，未发起同步。'
export const SYNC_IN_FLIGHT_MESSAGE = '同步进行中，本次未重复发起。'

/** 非 match 状态一律阻断，文案复用 account.ts 既有口径（不新增第二套说法）。 */
function blockedResult(state: OwnerBindingState, boundOwner: string | null): SyncEntryResult {
  return state === 'unbound'
    ? { status: 'blocked', reason: 'unbound', message: describeUnboundHint() }
    : { status: 'blocked', reason: 'mismatch', message: describeOwnerMismatch(boundOwner) }
}

/**
 * 同步入口：门禁 → push → pull → 落同步结果。
 * 阻断/跳过都不触网、不动本地数据。
 */
export async function runSyncEntry(deps: SyncEntryDeps): Promise<SyncEntryResult> {
  const now = deps.now ?? (() => Date.now())

  if (!deps.isConfigured) {
    return { status: 'skipped', reason: 'not_configured', message: SYNC_NOT_CONFIGURED_MESSAGE }
  }
  if (deps.loginState?.status !== 'signed_in') {
    return { status: 'skipped', reason: 'signed_out', message: SYNC_SIGNED_OUT_MESSAGE }
  }

  const currentUserId = deps.loginState.userId
  const boundOwner = getBoundOwner(deps.db) ?? null
  const gate = ownerGateForSync(boundOwner, currentUserId)
  if (!gate.allowed) return blockedResult(gate.state, boundOwner)

  // 同一时刻只跑一轮（Mine 的 focus 会重复触发）；残留锁可接管，不永久卡死。
  if (!acquireSyncLock(deps.db, now())) {
    return { status: 'skipped', reason: 'in_flight', message: SYNC_IN_FLIGHT_MESSAGE }
  }

  const outbox = deps.outbox ?? createOutbox(deps.db)
  try {
    const engines = deps.createEngines()
    const push = await createPushEngine({ db: deps.db, outbox, transport: engines.transport, now }).run({
      currentUserId,
    })
    const pull = await createPullEngine({ db: deps.db, source: engines.source, outbox, now }).run({
      currentUserId,
    })

    const at = new Date(now()).toISOString()
    setLastSyncResult(deps.db, {
      at,
      done: push.done.length,
      failed: push.failed.length,
      parked: push.parked.length,
    })
    setLastSyncAt(deps.db, at)
    return { status: 'ok', owner: engines.owner, push, pull }
  } catch (error) {
    // 门禁通过后 owner 才变（如并发换号）：push/pull 会抛同一门禁错误，按 account.ts 口径阻断。
    if (error instanceof OwnerBindingBlockedError) {
      return blockedResult(error.state, getBoundOwner(deps.db) ?? null)
    }
    const message = error instanceof Error ? error.message : String(error)
    setLastSyncResult(deps.db, {
      at: new Date(now()).toISOString(),
      done: 0,
      failed: 0,
      parked: 0,
      error: message,
    })
    return { status: 'error', message: `同步失败：${message}` }
  } finally {
    releaseSyncLock(deps.db)
  }
}

/** 同步结果的人话（Mine 直接显示；阻断/跳过即原文，不重复包装）。 */
export function describeSyncEntry(result: SyncEntryResult): string {
  switch (result.status) {
    case 'ok': {
      const parts = [`上传成功 ${result.push.done.length} 项`]
      if (result.push.failed.length > 0) parts.push(`失败 ${result.push.failed.length} 项`)
      if (result.push.parked.length > 0) parts.push(`停放 ${result.push.parked.length} 项`)
      if (result.pull.skipped) parts.push('拉取已跳过（本地有待传写入）')
      else {
        if (result.pull.applied > 0) parts.push(`下行 ${result.pull.applied} 项`)
        if (result.pull.conflicts > 0) parts.push(`新增冲突 ${result.pull.conflicts} 项`)
        if (result.pull.noRevival > 0) parts.push(`已删不复活 ${result.pull.noRevival} 项`)
      }
      return `已完成同步：${parts.join('，')}。`
    }
    default:
      return result.message
  }
}
