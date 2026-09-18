// Auth 编排（T054–T062 本地段）：PKCE 登录、回调去重状态机、中断 session-first 判定、
// SecureStore session、owner binding 门禁。真机/真账号登录留 T062，本模块全依赖可注入，
// 单测用 mock 覆盖成功/重复/中断/缺 verifier/owner 不匹配。
//
// 安全口径：`code` 只在内存调用链中传递；只持久化 SHA-256 指纹与状态/时间字段；
// access/refresh token 只经传入的 supabase-js storage（SecureStore adapter）落盘。

import {
  OAUTH_INCOMPLETE_STATUSES,
  OAUTH_PROVIDER,
  type AuthErrorClass,
  type OAuthFlowStatus,
} from './constants'
import {
  computeCallbackFingerprint,
  isFingerprintExpired,
  makeFingerprintRecord,
  type OAuthFingerprintRecord,
  type OAuthFingerprintRepo,
} from './fingerprint'
import { evaluateOwnerBinding, ownerGateForSync, type OwnerBindingState, type OwnerGateResult } from './owner'
import { buildAuthRedirectUri, parseAuthCallback } from './redirect'

export interface AuthSession {
  user: { id: string }
}

/** supabase-js auth 的最小结构子集（生产由 native 接线适配，测试 mock）。 */
export interface AuthClient {
  getSession(): Promise<{ session: AuthSession | null; error: unknown }>
  exchangeCodeForSession(code: string): Promise<{ session: AuthSession | null; error: unknown }>
  signInWithOAuth(params: {
    provider: typeof OAUTH_PROVIDER
    redirectTo: string
  }): Promise<{ url: string | null; error: unknown }>
  signOut(options?: { scope?: 'local' }): Promise<{ error: unknown }>
}

export interface AuthBrowserResult {
  type: 'success' | 'cancel' | 'dismiss' | 'error'
  url?: string
}

/** 系统浏览器/认证会话（生产为 `expo-web-browser` 的 `openAuthSessionAsync`）。 */
export interface AuthBrowserOpener {
  openAuthSession(url: string, redirectTo: string): Promise<AuthBrowserResult>
}

/** 本地 owner 绑定读写（生产接 SQLite `meta.bound_owner_user_id`）。 */
export interface OwnerStore {
  getBoundOwner(): Promise<string | null> | string | null
  setBoundOwner(ownerUserId: string | null): Promise<void> | void
}

export interface AuthServiceDeps {
  auth: AuthClient
  fingerprints: OAuthFingerprintRepo
  ownerStore: OwnerStore
  openBrowser: AuthBrowserOpener
  redirectTo?: string
  now?: () => number
}

export type CallbackOutcome =
  | { status: 'succeeded'; userId: string; binding: OwnerBindingState }
  | { status: 'owner_mismatch'; userId: string; boundOwner: string | null }
  | { status: 'duplicate'; flowStatus: OAuthFlowStatus }
  | { status: 'terminal_reauth'; errorClass: AuthErrorClass }
  | { status: 'error'; errorClass: AuthErrorClass }
  | { status: 'invalid'; reason: string }

export type LoginOutcome =
  | CallbackOutcome
  | { status: 'already_signed_in'; userId: string; binding: OwnerBindingState }
  | { status: 'cancelled' }

export type RecoveryOutcome =
  | { status: 'recovered'; userId: string; binding: OwnerBindingState }
  | { status: 'owner_mismatch'; userId: string; boundOwner: string | null }
  | { status: 'terminal_reauth'; errorClass: AuthErrorClass }
  | { status: 'no_session' }

export interface AuthService {
  /** HD-02 基线精确 redirect（落盘见 docs/AUTH_REDIRECT.md）。 */
  getRedirectUri(): string
  /** 清理超过 24h TTL 的指纹记录，返回删除条数。 */
  sweepFingerprints(): Promise<number>
  /** 发起 Google PKCE 登录；完成浏览器回调后直接处理。 */
  login(): Promise<LoginOutcome>
  /** 处理回调 URL（重复调用幂等）。 */
  handleCallback(url: string): Promise<CallbackOutcome>
  /** 冷启动恢复：session-first，无有效 session 则安全降级 terminal_reauth。 */
  recoverSession(): Promise<RecoveryOutcome>
  /** 本地登出：清 SecureStore token/verifier，不删业务本地数据。 */
  signOut(): Promise<void>
  /** 首次绑定确认后写 `bound_owner_user_id`（T057+ UI 调用）。 */
  bindOwner(userId: string): Promise<void>
  /** 导出并清空本地后切号用（UI 负责警示与二次确认）。 */
  unbindOwner(): Promise<void>
  /** Sync 侧 push/pull 门禁（后续接入）。 */
  getOwnerGate(currentUserId: string | null): Promise<OwnerGateResult>
  /** 只读诊断用（不含 code/token）。 */
  listFingerprints(): Promise<OAuthFingerprintRecord[]>
}

function iso(nowMs: number): string {
  return new Date(nowMs).toISOString()
}

function describeError(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; error?: unknown; error_description?: unknown }
    return [e.message, e.code, e.error, e.error_description].filter((v) => typeof v === 'string').join(' ')
  }
  return ''
}

/** 换码错误分类：只落短枚类，不落原始 code/token。 */
export function classifyExchangeError(error: unknown): AuthErrorClass {
  const text = describeError(error).toLowerCase()
  if (text.includes('verifier')) return 'missing_verifier'
  return 'exchange_error'
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const redirectTo = deps.redirectTo ?? buildAuthRedirectUri()
  const now = deps.now ?? (() => Date.now())

  async function safeGetSession(): Promise<AuthSession | null> {
    try {
      const { session } = await deps.auth.getSession()
      return session ?? null
    } catch {
      return null
    }
  }

  async function readOwner(): Promise<string | null> {
    const value = await Promise.resolve(deps.ownerStore.getBoundOwner())
    return value ?? null
  }

  async function setStatus(
    hash: string,
    status: OAuthFlowStatus,
    nowMs: number,
    errorClass: AuthErrorClass | null = null,
  ): Promise<void> {
    const existing = await deps.fingerprints.get(hash)
    const base = existing ?? makeFingerprintRecord(hash, 'received', nowMs)
    await deps.fingerprints.upsert({ ...base, status, updatedAt: iso(nowMs), errorClass })
  }

  async function markIncomplete(
    status: OAuthFlowStatus,
    nowMs: number,
    errorClass: AuthErrorClass | null,
  ): Promise<number> {
    const records = await deps.fingerprints.list()
    const incomplete = records.filter((r) => OAUTH_INCOMPLETE_STATUSES.includes(r.status))
    for (const record of incomplete) {
      await deps.fingerprints.upsert({ ...record, status, updatedAt: iso(nowMs), errorClass })
    }
    return incomplete.length
  }

  async function outcomeForUser(userId: string): Promise<CallbackOutcome> {
    const bound = await readOwner()
    const binding = evaluateOwnerBinding(bound, userId)
    if (binding === 'mismatch') return { status: 'owner_mismatch', userId, boundOwner: bound }
    return { status: 'succeeded', userId, binding }
  }

  async function recoveryOutcomeForUser(userId: string): Promise<RecoveryOutcome> {
    const bound = await readOwner()
    const binding = evaluateOwnerBinding(bound, userId)
    if (binding === 'mismatch') return { status: 'owner_mismatch', userId, boundOwner: bound }
    return { status: 'recovered', userId, binding }
  }

  async function handleCallback(url: string): Promise<CallbackOutcome> {
    const nowMs = now()
    const parsed = parseAuthCallback(url)
    if (parsed.kind === 'invalid') return { status: 'invalid', reason: parsed.reason }
    if (parsed.kind === 'error') return { status: 'error', errorClass: parsed.errorClass }

    await deps.fingerprints.sweep(nowMs)
    const hash = computeCallbackFingerprint(parsed.code, parsed.callbackPath)
    const existing = await deps.fingerprints.get(hash)
    if (existing && !isFingerprintExpired(existing, nowMs)) {
      // 四态中任一状态都不二次换码：重复/迟到回调幂等返回既有状态。
      return { status: 'duplicate', flowStatus: existing.status }
    }

    await deps.fingerprints.upsert(makeFingerprintRecord(hash, 'received', nowMs))
    await setStatus(hash, 'exchanging', nowMs)

    let exchange: { session: AuthSession | null; error: unknown }
    try {
      exchange = await deps.auth.exchangeCodeForSession(parsed.code)
    } catch (error) {
      const errorClass = classifyExchangeError(error)
      await setStatus(hash, 'terminal_reauth', nowMs, errorClass)
      return { status: 'terminal_reauth', errorClass }
    }

    if (exchange.error || !exchange.session) {
      const errorClass = classifyExchangeError(exchange.error)
      await setStatus(hash, 'terminal_reauth', nowMs, errorClass)
      return { status: 'terminal_reauth', errorClass }
    }

    // 换码成功且 SecureStore session 可再读后才置 succeeded。
    const persisted = await safeGetSession()
    if (!persisted) {
      await setStatus(hash, 'terminal_reauth', nowMs, 'session_not_persisted')
      return { status: 'terminal_reauth', errorClass: 'session_not_persisted' }
    }

    await setStatus(hash, 'succeeded', nowMs)
    return outcomeForUser(persisted.user.id)
  }

  return {
    getRedirectUri: () => redirectTo,

    sweepFingerprints: () => deps.fingerprints.sweep(now()),

    handleCallback,

    async login() {
      const nowMs = now()
      await deps.fingerprints.sweep(nowMs)

      const current = await safeGetSession()
      if (current) {
        // 已有有效 session：把未完成 flow 收敛为 succeeded，不再新建 transaction。
        await markIncomplete('succeeded', nowMs, null)
        return {
          status: 'already_signed_in',
          userId: current.user.id,
          binding: evaluateOwnerBinding(await readOwner(), current.user.id),
        }
      }

      // 单流策略：旧 flow 未完成且无有效 session → 置 terminal_reauth、丢弃旧 session/verifier。
      const discarded = await markIncomplete('terminal_reauth', nowMs, 'superseded')
      if (discarded > 0) {
        try {
          await deps.auth.signOut({ scope: 'local' })
        } catch {
          // 本地清理失败不阻断新登录；旧 code 指纹已 terminal，不会被重用。
        }
      }

      let oauth: { url: string | null; error: unknown }
      try {
        oauth = await deps.auth.signInWithOAuth({ provider: OAUTH_PROVIDER, redirectTo })
      } catch {
        return { status: 'error', errorClass: 'provider_error' }
      }
      if (oauth.error || !oauth.url) return { status: 'error', errorClass: 'provider_error' }

      let browser: AuthBrowserResult
      try {
        browser = await deps.openBrowser.openAuthSession(oauth.url, redirectTo)
      } catch {
        return { status: 'error', errorClass: 'provider_error' }
      }

      if (browser.type === 'success' && browser.url) return handleCallback(browser.url)
      if (browser.type === 'cancel' || browser.type === 'dismiss') return { status: 'cancelled' }
      return { status: 'error', errorClass: 'provider_error' }
    },

    async recoverSession() {
      const nowMs = now()
      await deps.fingerprints.sweep(nowMs)

      const session = await safeGetSession()
      const ranIncomplete = await markIncomplete(
        session ? 'succeeded' : 'terminal_reauth',
        nowMs,
        session ? null : 'interrupted_no_session',
      )

      if (session) return recoveryOutcomeForUser(session.user.id)
      if (ranIncomplete > 0) return { status: 'terminal_reauth', errorClass: 'interrupted_no_session' }
      return { status: 'no_session' }
    },

    async signOut() {
      await deps.auth.signOut({ scope: 'local' })
    },

    bindOwner: (userId) => Promise.resolve(deps.ownerStore.setBoundOwner(userId)),

    unbindOwner: () => Promise.resolve(deps.ownerStore.setBoundOwner(null)),

    getOwnerGate: async (currentUserId) => ownerGateForSync(await readOwner(), currentUserId),

    listFingerprints: () => deps.fingerprints.list(),
  }
}
