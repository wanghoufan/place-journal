// 主题上下文（对标 Web `applyTheme` 的全站换装）：
//   - 当前主题持久化在本机 SQLite `meta` 表（键 `app_theme`），冷启动读回；
//   - `useTheme()` 返回 `{ theme, palette, setTheme }`，未挂 Provider 时回退暖纸默认值，
//     保证单测/独立渲染组件不炸（与 Web 的 localStorage 缺省同口径）。
// 只做状态与持久化，不含组件样式；样式由各页面按 `palette` 现场构造。

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { getAppRepository } from './db/app'
import { getMeta, setMeta } from './sync/meta'
import { colors, paletteFor, parseTheme, THEME_META_KEY, type AppTheme, type Palette } from './theme'

export interface ThemeContextValue {
  theme: AppTheme
  palette: Palette
  setTheme: (theme: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'warm',
  palette: colors,
  // 未挂 Provider 时是无副作用的空实现（组件仍按暖纸渲染）。
  setTheme: () => {},
})

/** 冷启动读回上次选择（只读一次，惰性初始化）；本机库不可用时保持默认主题 0 副作用。 */
function initialTheme(): AppTheme {
  try {
    const { db } = getAppRepository()
    return parseTheme(getMeta<string>(db, THEME_META_KEY))
  } catch {
    return 'warm'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme)

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(parseTheme(next))
    try {
      const { db } = getAppRepository()
      setMeta(db, THEME_META_KEY, parseTheme(next))
    } catch {
      // 落库失败只影响下次冷启动，本次切换仍生效。
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, palette: paletteFor(theme), setTheme }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
