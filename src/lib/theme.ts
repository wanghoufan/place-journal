// 全站外观主题：CSS 变量切换（tailwind colors 全部走 var），与分享卡主题同名同源
export type AppTheme = 'warm' | 'ticket' | 'sage'

const KEY = 'app-theme'
export const APP_THEMES: { id: AppTheme; name: string; swatch: string }[] = [
  { id: 'warm', name: '暖纸手账', swatch: '#efe7d7' },
  { id: 'ticket', name: '票根台账', swatch: '#e9dac0' },
  { id: 'sage', name: '竹青园林', swatch: '#f4f6f0' },
]

export function applyTheme(t: AppTheme) {
  localStorage.setItem(KEY, t)
  document.documentElement.dataset.theme = t
}

export function initTheme() {
  const saved = localStorage.getItem(KEY) as AppTheme | null
  document.documentElement.dataset.theme = saved ?? 'warm'
}
