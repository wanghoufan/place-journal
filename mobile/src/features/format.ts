// 展示格式化纯函数（TASK-DEV-09）：日期、同步状态、评分文案。
// 无副作用、无 Expo 依赖，供各页面与单测复用。

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `2026-09-18` → `2026 . 09 . 18`。 */
export function formatVisitDate(visitDate: string): string {
  return visitDate.replace(/-/g, ' . ')
}

/** 相对日期 chip：今天 / 昨天 / N 天前 / N 周前 / M 月 D 日。 */
export function relativeDayChip(visitDate: string, now: Date = new Date()): string {
  const target = Date.parse(`${visitDate}T00:00:00`)
  if (Number.isNaN(target)) return visitDate
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((start - target) / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  const [, month, day] = visitDate.split('-')
  return `${Number(month)} 月 ${Number(day)} 日`
}

/** ISO 时间戳 → 本地 `YYYY-MM-DD HH:mm`。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export type SyncStatusLike = 'local' | 'syncing' | 'synced' | 'failed' | 'conflict' | string

/** 同步状态中文标签。 */
export function syncLabel(status: SyncStatusLike | null | undefined): string {
  switch (status) {
    case 'synced':
      return '已同步'
    case 'syncing':
      return '同步中'
    case 'failed':
      return '同步失败'
    case 'conflict':
      return '冲突待裁决'
    case 'local':
      return '仅本机'
    default:
      return '仅本机'
  }
}

/** 状态色调（红=失败/冲突，绿=已同步，灰=本地/同步中）。 */
export function syncTone(status: SyncStatusLike | null | undefined): 'ok' | 'warn' | 'muted' {
  if (status === 'synced') return 'ok'
  if (status === 'failed' || status === 'conflict') return 'warn'
  return 'muted'
}

export function starsText(rating: number | undefined): string {
  if (!rating) return '未评分'
  const filled = '★'.repeat(Math.max(0, Math.min(5, Math.round(rating))))
  const empty = '☆'.repeat(5 - filled.length)
  return `${filled}${empty}`
}

export function truncate(text: string | undefined, max = 60): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 数字输入安全解析：空/非法 → undefined。 */
export function parseOptionalInt(value: string, min = 1, max = 99999): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** 预算解析（允许 0）。 */
export function parseOptionalBudget(value: string): number | undefined {
  return parseOptionalInt(value, 0, 1000000)
}
