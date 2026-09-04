// 基础 UI 组件（手账风）
import { ReactNode, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getVersion, subscribe, repo } from '../lib/idb'
import type { Entry, MediaItem } from '../lib/types'
import { cloudState, type CloudState } from '../lib/sync'

// ---- 数据 hook ----
export function useDBData() {
  const [v, setV] = useState(getVersion())
  useEffect(() => subscribe(() => setV(getVersion())), [])
  const [data, setData] = useState<null | Awaited<ReturnType<typeof loadAll>>>(null)
  const reload = useCallback(async () => setData(await loadAll()), [])
  useEffect(() => { reload() }, [v, reload])
  return data
}
async function loadAll() {
  const [places, entries, media, dimensions, tags, shares] = await Promise.all([
    repo.places(), repo.entries(), repo.media(), repo.dimensions(), repo.tags(), repo.shares(),
  ])
  return { places, entries, media, dimensions, tags, shares }
}
export function useCloudState(): CloudState | 'loading' {
  const [s, setS] = useState<CloudState | 'loading'>('loading')
  useEffect(() => { cloudState().then(setS) }, [])
  return s
}

// ---- 页头 ----
export function PageHeader({ title, back, onClose, right }: { title: string; back?: boolean; onClose?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-2">
      <div className="flex items-center gap-3">
        {back && (
          <button onClick={() => nav(-1)} aria-label="返回" className="w-9 h-9 rounded-full bg-card flex items-center justify-center shadow-card text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        )}
        <h1 className="journal-title">{title}<span className="text-terra align-super text-sm ml-0.5">✦</span></h1>
      </div>
      <div className="flex items-center gap-2">
        {right}
        {onClose && (
          <button onClick={() => nav(-1)} aria-label="关闭" className="w-9 h-9 rounded-full bg-card flex items-center justify-center shadow-card text-inkmuted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ---- 星级 ----
export function Stars({ value, size = 16, editable, onChange }: { value?: number; size?: number; editable?: boolean; onChange?: (v: number) => void }) {
  // 只读模式渲染 span 而非 button：卡片本身常是 button，避免 button 嵌套 button（React validateDOMNesting）
  return (
    <span className="inline-flex items-center gap-0.5" role={editable ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((i) => {
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24"
            fill={value != null && i <= value ? '#e8971e' : 'none'} stroke={value != null && i <= value ? '#e8971e' : '#c9b9a0'} strokeWidth="1.8">
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z" strokeLinejoin="round" />
          </svg>
        )
        return editable ? (
          <button key={i} type="button" onClick={() => onChange?.(i)} className="active:scale-90 transition" aria-label={`${i} 星`}>{star}</button>
        ) : (
          <span key={i} aria-hidden>{star}</span>
        )
      })}
    </span>
  )
}

// ---- 云端状态条 ----
const CLOUD_TEXT: Record<Exclude<CloudState, 'syncing'>, { text: string; cls: string }> = {
  unconfigured: { text: '本地模式 · 未配置云端（填入 Supabase 环境变量后启用登录与跨设备同步）', cls: 'bg-carddeep text-inkmuted' },
  offline: { text: '当前离线 · 新记录已保存在本机，联网后自动同步', cls: 'bg-[#f5e6bf] text-[#8a6d1f]' },
  'signed-out': { text: '已连接云端 · 尚未登录，去「我的」用 Google 登录', cls: 'bg-terrasoft text-terradeep' },
  error: { text: '同步出错 · 数据保留在本机，可稍后重试', cls: 'bg-[#f6d5cf] text-[#a03c2a]' },
  idle: { text: '已同步', cls: 'bg-[#dfe9d8] text-moss' },
}
export function CloudBanner({ state }: { state: CloudState | 'loading' }) {
  if (state === 'loading' || state === 'idle' || state === 'syncing') return null
  const t = CLOUD_TEXT[state]
  return <div className={`mx-5 mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed ${t.cls}`}>{t.text}</div>
}

// ---- 同步小圆点 ----
export function SyncDot({ status }: { status: Entry['sync'] }) {
  const map: Record<Entry['sync'], [string, string]> = {
    local: ['bg-[#c9b9a0]', '仅本机'],
    syncing: ['bg-[#e8971e] animate-pulse', '同步中'],
    synced: ['bg-[#7ba05b]', '已同步'],
    failed: ['bg-[#c0392b]', '同步失败'],
    conflict: ['bg-[#e8971e]', '同步冲突 · 待处理'],
  }
  const [cls, label] = map[status]
  return <span title={label} className={`inline-block w-2 h-2 rounded-full ${cls}`} />
}

// ---- 空状态 ----
export function EmptyState({ icon = '📷', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-16 px-8">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="text-lg font-bold">{title}</p>
      {hint && <p className="text-sm text-inkmuted mt-1 leading-relaxed">{hint}</p>}
    </div>
  )
}

// ---- 字段行（AI 确认/详情页）----
export function FieldRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-line/50 last:border-0">
      <span className="flex items-center gap-2 text-ink font-bold shrink-0">{icon}{label}</span>
      <span className="text-right min-w-0">{children}</span>
    </div>
  )
}

// ---- 图片：blob URL 管理 ----
export function useBlobUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) { setUrl(undefined); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Thumb({ m, className, preferThumb }: { m: MediaItem; className?: string; preferThumb?: boolean }) {
  const blobUrl = useBlobUrl(preferThumb ? m.thumb : m.display ?? m.thumb)
  const remote = blobUrl ? undefined : m.remotePath ? undefined : undefined
  const src = blobUrl ?? m.demoUri ?? remote
  if (!src) return <div className={`bg-carddeep ${className ?? ''}`} />
  return <img src={src} alt="" loading="lazy" className={`object-cover ${className ?? ''}`} />
}

// ---- 底部弹层 ----
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto shadow-pop">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-inkmuted text-xl px-2">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
