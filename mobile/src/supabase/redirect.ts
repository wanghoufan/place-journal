// App redirect 生成与回调校验（T054）。
//
// 口径（计划 User Flow 4 / Technical Approach/Auth）：
//   - 只接受 HD-02 基线唯一精确 scheme/host/path（`com.wanghoufan.placejournal://auth/callback`）；
//   - 回调先处理 `error/error_description`，再取一次性 `code`；错误 redirect 一律拒绝且不换码；
//   - 本模块纯逻辑，不依赖 Expo 原生模块，便于完整单测。
//
// 注：`code` 只在内存调用链中向上层传递，本模块不写任何存储、不打印完整 callback URL。

import {
  APP_SCHEME,
  AUTH_CALLBACK_HOST,
  AUTH_CALLBACK_PATH,
  AUTH_CALLBACK_PATHNAME,
  AUTH_REDIRECT_URI,
  type AuthErrorClass,
} from './constants'

export interface AuthCallbackCode {
  kind: 'code'
  code: string
  /** 去重指纹用的稳定路径串（host/path）。 */
  callbackPath: string
}

export interface AuthCallbackError {
  kind: 'error'
  error: string
  errorDescription: string | null
  errorClass: AuthErrorClass
}

export interface AuthCallbackInvalid {
  kind: 'invalid'
  reason: string
  errorClass: AuthErrorClass
}

export type ParsedAuthCallback = AuthCallbackCode | AuthCallbackError | AuthCallbackInvalid

/** 默认精确 redirect 串（HD-02 基线）。 */
export function buildAuthRedirectUri(): string {
  return AUTH_REDIRECT_URI
}

/**
 * 用运行时 `createURL`（如 `expo-linking` 的 `Linking.createURL`）生成 redirect，
 * 并强制校验与基线精确一致；漂移直接抛错（避免临时 scheme 导致 OAuth 回跳漂移）。
 */
export function resolveAuthRedirectUri(createURL: (path: string) => string): string {
  const uri = createURL(AUTH_CALLBACK_PATHNAME)
  if (!isAllowedAuthRedirect(uri)) throw new Error('AUTH_REDIRECT_DRIFT')
  return uri
}

/** 校验 URL 是否为唯一精确的 App callback（scheme/host/path 全等）。 */
export function isAllowedAuthRedirect(url: string): boolean {
  const parsed = safeParse(url)
  if (!parsed) return false
  return (
    parsed.protocol === `${APP_SCHEME}:` &&
    parsed.host === AUTH_CALLBACK_HOST &&
    parsed.pathname === `/${AUTH_CALLBACK_PATH}`
  )
}

function safeParse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function readParam(url: URL, key: string): string | null {
  const query = url.searchParams.get(key)
  if (query != null) return query
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : ''
  if (!fragment) return null
  return new URLSearchParams(fragment).get(key)
}

/**
 * 解析回调 URL（PKCE）：
 *   1. scheme/host/path 不精确 → invalid（不换码）；
 *   2. 有 `error` → error（先于 code 处理）；
 *   3. 有非空 `code` → code；
 *   4. 都没有 → invalid(missing_code)。
 */
export function parseAuthCallback(url: string): ParsedAuthCallback {
  const parsed = safeParse(url)
  if (!parsed) return { kind: 'invalid', reason: 'unparseable_url', errorClass: 'invalid_redirect' }
  if (!isAllowedAuthRedirect(url)) {
    return { kind: 'invalid', reason: 'redirect_mismatch', errorClass: 'invalid_redirect' }
  }

  const error = readParam(parsed, 'error')
  if (error) {
    return {
      kind: 'error',
      error,
      errorDescription: readParam(parsed, 'error_description'),
      errorClass: 'provider_error',
    }
  }

  const code = readParam(parsed, 'code')
  if (code) {
    return { kind: 'code', code, callbackPath: AUTH_CALLBACK_PATHNAME }
  }

  return { kind: 'invalid', reason: 'missing_code', errorClass: 'missing_code' }
}
