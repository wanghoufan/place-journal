// 环境变量集中读取：全部允许为空，各能力用 isConfigured() 判断降级
const v = (k: string) => (import.meta.env as Record<string, string | undefined>)[k] || ''

export const env = {
  supabaseUrl: v('VITE_SUPABASE_URL'),
  // 规范（V1.2 §7.1）：浏览器只放 URL + publishable key；兼容旧变量名 anon key
  supabasePublishableKey: v('VITE_SUPABASE_PUBLISHABLE_KEY') || v('VITE_SUPABASE_ANON_KEY'),
  amapKey: v('VITE_AMAP_KEY'),
  amapSecurityCode: v('VITE_AMAP_SECURITY_JSCODE'),
}

export const cloudConfigured = () => !!(env.supabaseUrl && env.supabasePublishableKey)
export const amapConfigured = () => !!env.amapKey
