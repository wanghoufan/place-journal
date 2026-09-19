// 冷启动 Auth 接线（TASK-DEV-11；关闭 CODE_REVIEW_DEV-05 P1-1/P1-2 的集成缺口）。
//
// 固定启动序列（单测锁定，不得换序）：
//   1) `sweepFingerprints`——清理 TTL(24h) 过期回调指纹，幂等；
//   2) `recoverSession`——session-first 恢复；无有效 session 的未完成 flow 收敛 `terminal_reauth`，
//      绝不重用旧 code（含 owner binding 结论）；
//   3) `attachAuthAutoRefresh` + `subscribeAuthCallbacks`——存活期自动刷新与 scheme 回调监听；
//   4) `getInitialAuthUrl`——冷启动回调补收。必须排在 `recoverSession` 之后：session-first 已把
//      旧 `exchanging/received` 指纹收敛，迟到的旧 code 只会命中 `duplicate/terminal`，不会二次换码。
//
// 依赖全部注入，本模块不 import 任何 Expo 原生模块；`app/_layout.tsx` 负责注入 native 实现，
// 单测只注入 mock。未配置 Supabase 环境变量时（`isConfigured() === false`）整段跳过。

import type { AuthService, RecoveryOutcome } from './auth'

/** 冷启动只需 AuthService 的这三个能力（其余由原生单例提供）。 */
export type AuthStartupService = Pick<AuthService, 'sweepFingerprints' | 'recoverSession' | 'handleCallback'>

export interface AuthStartupDeps {
  /** Supabase 环境变量齐备时才启动真实 Auth 生命周期。 */
  isConfigured: () => boolean
  service: AuthStartupService
  /** 冷启动时 App 被 scheme 唤起携带的初始 URL（无则 null）。 */
  getInitialUrl: () => Promise<string | null>
  /** App 存活期 scheme 回调监听，返回取消订阅函数。 */
  subscribeAuthCallbacks: (handler: (url: string) => void) => () => void
  /** AppState 自动刷新接线，返回 detach 函数。 */
  attachAuthAutoRefresh: () => () => void
  /** 恢复结论回调（诊断/UI 用，可选）。 */
  onRecovery?: (outcome: RecoveryOutcome) => void
}

export interface AuthStartupHandle {
  /** 本次冷启动的恢复结论；未配置 Supabase 时为 null。 */
  recovery: RecoveryOutcome | null
  /** 解除 scheme 监听与自动刷新（组件卸载时调用）。 */
  dispose: () => void
}

function noop(): void {
  // 未配置时无监听可解，占位保持 handle 形状一致。
}

export async function startAuthLifecycle(deps: AuthStartupDeps): Promise<AuthStartupHandle> {
  if (!deps.isConfigured()) return { recovery: null, dispose: noop }

  await deps.service.sweepFingerprints()

  const recovery = await deps.service.recoverSession()
  deps.onRecovery?.(recovery)

  const detachAutoRefresh = deps.attachAuthAutoRefresh()
  const unsubscribe = deps.subscribeAuthCallbacks((url) => {
    void deps.service.handleCallback(url).catch(noop)
  })

  const initialUrl = await deps.getInitialUrl()
  if (initialUrl) {
    await deps.service.handleCallback(initialUrl).catch(noop)
  }

  return {
    recovery,
    dispose: () => {
      unsubscribe()
      detachAutoRefresh()
    },
  }
}
