// Supabase 适配 + 认证。未配置时一切调用走本地模式。
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { env, cloudConfigured } from './env'

let client: SupabaseClient | null = null

// 规范（V1.2 §2）：业务表不进 public，本工具固定使用独立 Schema。
export const DB_SCHEMA = 'habit_tracker'
/** 带 Schema 的查询入口：table('places') → habit_tracker.places */
export function table(sb: SupabaseClient, name: string) {
  return sb.schema(DB_SCHEMA).from(name)
}

export function supabase(): SupabaseClient {
  if (!cloudConfigured()) throw new Error('cloud-not-configured')
  if (!client) client = createClient(env.supabaseUrl, env.supabasePublishableKey)
  return client
}

// ---- 本地用户（未配置云端时的身份）----
const LOCAL_USER = 'local-user'
export async function currentUserId(): Promise<string> {
  if (cloudConfigured()) {
    try { return (await supabase().auth.getUser()).data.user?.id ?? LOCAL_USER } catch { return LOCAL_USER }
  }
  return LOCAL_USER
}

export async function getSession(): Promise<Session | null> {
  if (!cloudConfigured()) return null
  try { return (await supabase().auth.getSession()).data.session } catch { return null }
}

export async function signInGoogle(): Promise<{ ok: boolean; error?: string }> {
  if (!cloudConfigured()) return { ok: false, error: '未配置 Supabase（VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY），登录不可用。当前为本地模式，数据仅保存在本机。' }
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function signOut() {
  if (cloudConfigured()) { try { await supabase().auth.signOut() } catch { /* ignore */ } }
}

export async function onAuthChange(cb: (session: Session | null) => void): Promise<() => void> {
  if (!cloudConfigured()) { cb(null); return () => {} }
  const { data } = supabase().auth.onAuthStateChange((_e, s) => cb(s))
  cb((await getSession()))
  return () => data.subscription.unsubscribe()
}
