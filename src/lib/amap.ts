// 高德地图 JS API 加载器（未配置时由 MapView 走示意底图降级）
import { env, amapConfigured } from './env'

let loading: Promise<any> | null = null

export function loadAmap(): Promise<any> {
  if (!amapConfigured()) return Promise.reject(new Error('amap-not-configured'))
  const w = window as any
  if (w.AMap) return Promise.resolve(w.AMap)
  if (loading) return loading
  // 安全密钥（2021-12 后新 Key 必需）
  if (env.amapSecurityCode) w._AMapSecurityConfig = { securityJsCode: env.amapSecurityCode }
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${env.amapKey}&callback=__amap_cb`
    s.onerror = () => { loading = null; reject(new Error('amap-load-failed')) }
    w.__amap_cb = () => resolve(w.AMap)
    document.head.appendChild(s)
  })
  return loading
}
