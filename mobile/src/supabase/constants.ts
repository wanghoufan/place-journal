// Auth 常量（T054–T062 本地段）：稳定 scheme/host/path、存储键、TTL、状态枚举。
//
// HD-02 基线（2026-09-18 已决）：Android package 与 Expo scheme 均为
// `com.wanghoufan.placejournal`。App redirect 与 Google Provider callback 分层：
// 本文件只描述 App redirect（HD-03 需用户在 Supabase Dashboard→Auth→Redirect URLs 加白）。

/** App identity（与 `mobile/app.config.ts` 的 scheme/package 逐字一致）。 */
export const APP_SCHEME = 'com.wanghoufan.placejournal'
/** 回调 host：校验与生成共用，避免各处字符串漂移。 */
export const AUTH_CALLBACK_HOST = 'auth'
/** 回调 path（不含前导斜杠）。 */
export const AUTH_CALLBACK_PATH = 'callback'
/** 去重指纹域隔离用的路径串（host/path，稳定不变）。 */
export const AUTH_CALLBACK_PATHNAME = `${AUTH_CALLBACK_HOST}/${AUTH_CALLBACK_PATH}`

/**
 * HD-02 基线精确 redirect 串（唯一真源；落盘见 `mobile/docs/AUTH_REDIRECT.md`）。
 * 形态：`com.wanghoufan.placejournal://auth/callback`
 */
export const AUTH_REDIRECT_URI = `${APP_SCHEME}://${AUTH_CALLBACK_HOST}/${AUTH_CALLBACK_PATH}`

/** OAuth provider（V1 只走 Supabase-hosted Google）。 */
export const OAUTH_PROVIDER = 'google' as const

/** 指纹域隔离前缀（计划原文：SHA-256("place-journal-oauth-v1" + callbackPath + code)）。 */
export const OAUTH_FINGERPRINT_DOMAIN = 'place-journal-oauth-v1'

/** 指纹记录 TTL：received_at + 24h（App 启动/新登录前/恢复 session 后 sweep）。 */
export const OAUTH_FINGERPRINT_TTL_MS = 24 * 60 * 60 * 1000

/** `exchanging` 超过该时长视为结果不确定（配合 session-first 判定）。 */
export const OAUTH_EXCHANGE_UNCERTAIN_MS = 2 * 60 * 1000

/** SecureStore 中 supabase-js session（access/refresh）与 PKCE verifier 的存储命名空间。 */
export const AUTH_STORAGE_KEY = 'place-journal.auth'

/** SecureStore 中去重指纹记录（只含 SHA-256 与状态/时间字段）的键。 */
export const AUTH_FINGERPRINT_STORAGE_KEY = 'place-journal.auth.fingerprints'

/** 去重指纹状态机（计划原文四态）。 */
export const OAUTH_FLOW_STATUSES = ['received', 'exchanging', 'succeeded', 'terminal_reauth'] as const
export type OAuthFlowStatus = (typeof OAUTH_FLOW_STATUSES)[number]

/** 进入/处于这两个状态表示 flow 未完成（中断恢复判定用）。 */
export const OAUTH_INCOMPLETE_STATUSES: readonly OAuthFlowStatus[] = ['received', 'exchanging']

/** 错误分类：只落枚举/短串，绝不落 code、token 或完整 callback URL。 */
export const AUTH_ERROR_CLASSES = [
  'provider_error',
  'missing_code',
  'invalid_redirect',
  'exchange_error',
  'missing_verifier',
  'session_not_persisted',
  'interrupted_no_session',
  'superseded',
  'cancelled',
] as const
export type AuthErrorClass = (typeof AUTH_ERROR_CLASSES)[number]
