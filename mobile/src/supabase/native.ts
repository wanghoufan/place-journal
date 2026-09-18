// Auth 原生接线（T054–T062 本地段的运行时组装）。
//
// 本文件是 `src/supabase` 内唯一 import Expo 原生模块（SecureStore/WebBrowser/Linking）
// 与 `@supabase/supabase-js` 的地方；纯逻辑与单测不触碰它。
//
// 口径：
//   - supabase-js `auth.storage` = SecureStore adapter（session 与 PKCE verifier 共用，R4-03）；
//   - `flowType: 'pkce'`、`detectSessionInUrl: false`、`persistSession` 开启；
//   - 登录走 `signInWithOAuth(skipBrowserRedirect:true)` + 系统浏览器 `openAuthSessionAsync`；
//   - redirectTo 用 HD-02 基线常量（精确串，禁临时 scheme）。
//
// 环境变量（`mobile/.env.example`）：`EXPO_PUBLIC_SUPABASE_URL` /
// `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。只允许 publishable key，禁 service_role。

import 'react-native-url-polyfill/auto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { AppState, type AppStateStatus } from 'react-native'

import { getAppRepository } from '../db/app'
import { getBoundOwner, setBoundOwner } from '../sync/meta'
import {
  createAuthService,
  type AuthBrowserOpener,
  type AuthClient,
  type AuthService,
  type OwnerStore,
} from './auth'
import { AUTH_FINGERPRINT_STORAGE_KEY, AUTH_STORAGE_KEY } from './constants'
import { createOAuthFingerprintRepo } from './fingerprint'
import { buildAuthRedirectUri, resolveAuthRedirectUri } from './redirect'
import { createSecureJsonStore, createSecureStoreAdapter } from './secureStore'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

/** 是否已配置 Supabase 环境变量（缺省时 App 不应发起真实登录）。 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0
}

let cachedClient: SupabaseClient | null = null

/** 创建（或复用）supabase 客户端；token 只经 SecureStore adapter 落盘。 */
export function getSupabaseAuthClient(): SupabaseClient {
  if (!cachedClient) {
    if (!isSupabaseConfigured()) throw new Error('SUPABASE_ENV_MISSING')
    cachedClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: createSecureStoreAdapter(SecureStore),
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  }
  return cachedClient
}

function toAuthClient(client: SupabaseClient): AuthClient {
  const auth = client.auth
  return {
    async getSession() {
      const { data, error } = await auth.getSession()
      return { session: data.session ? { user: { id: data.session.user.id } } : null, error }
    },
    async exchangeCodeForSession(code) {
      const { data, error } = await auth.exchangeCodeForSession(code)
      return { session: data.session ? { user: { id: data.session.user.id } } : null, error }
    },
    async signInWithOAuth({ provider, redirectTo }) {
      const { data, error } = await auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      })
      return { url: data.url ?? null, error }
    },
    async signOut(options) {
      const { error } = await auth.signOut(options ?? { scope: 'local' })
      return { error }
    },
  }
}

const openBrowser: AuthBrowserOpener = {
  async openAuthSession(url, redirectTo) {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectTo)
    if (result.type === 'success') return { type: 'success', url: result.url }
    if (result.type === 'cancel') return { type: 'cancel' }
    return { type: 'dismiss' }
  },
}

const ownerStore: OwnerStore = {
  getBoundOwner: () => getBoundOwner(getAppRepository().db) ?? null,
  setBoundOwner: (ownerUserId) => {
    setBoundOwner(getAppRepository().db, ownerUserId)
  },
}

let cachedService: AuthService | null = null

/** 原生 AuthService 单例（首用创建）。 */
export function getAuthService(): AuthService {
  if (!cachedService) {
    cachedService = createAuthService({
      auth: toAuthClient(getSupabaseAuthClient()),
      fingerprints: createOAuthFingerprintRepo(createSecureJsonStore(SecureStore, AUTH_FINGERPRINT_STORAGE_KEY)),
      ownerStore,
      openBrowser,
      redirectTo: buildAuthRedirectUri(),
    })
  }
  return cachedService
}

/** HD-02 基线精确 redirect（用于落盘/诊断）。 */
export function getAuthRedirectUri(): string {
  return buildAuthRedirectUri()
}

/** 用运行时 `Linking.createURL` 生成 redirect 并强制与基线一致（漂移即抛错）。 */
export function getRuntimeAuthRedirectUri(): string {
  return resolveAuthRedirectUri((path) => Linking.createURL(path))
}

/** 冷启动时 App 被 scheme 唤起携带的初始 URL（无则 null）。 */
export function getInitialAuthUrl(): Promise<string | null> {
  return Linking.getInitialURL()
}

/** App 存活期间 scheme 回调监听；返回取消订阅函数。 */
export function subscribeAuthCallbacks(handler: (url: string) => void): () => void {
  const subscription = Linking.addEventListener('url', ({ url }) => handler(url))
  return () => subscription.remove()
}

/**
 * AppState 自动刷新：前台 startAutoRefresh、后台 stopAutoRefresh。
 * 返回 detach 函数。`getAuthService` 不依赖它，需在根布局显式调用。
 */
export function attachAuthAutoRefresh(): () => void {
  const client = getSupabaseAuthClient()
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') client.auth.startAutoRefresh()
    else client.auth.stopAutoRefresh()
  }
  const subscription = AppState.addEventListener('change', onChange)
  if (AppState.currentState === 'active') client.auth.startAutoRefresh()
  return () => {
    subscription.remove()
    client.auth.stopAutoRefresh()
  }
}
