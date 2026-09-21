// 主题三调色板与解析（对齐 Web `src/lib/theme.ts` 的 APP_THEMES 口径）。

import {
  APP_THEMES,
  colors,
  DEFAULT_THEME,
  isAppTheme,
  paletteFor,
  PALETTES,
  parseTheme,
  THEME_META_KEY,
} from '../../theme'

describe('theme: 三主题调色板', () => {
  it('三主题齐全，名称与 Web 一致；warm 即向后兼容的 colors', () => {
    expect(APP_THEMES.map((t) => t.id)).toEqual(['warm', 'ticket', 'sage'])
    expect(APP_THEMES.map((t) => t.name)).toEqual(['暖纸手账', '票根台账', '竹青园林'])
    expect(PALETTES.warm).toBe(colors)
  })

  it('每套调色板字段完整且为合法色值；强调色三主题共用', () => {
    for (const { id } of APP_THEMES) {
      const p = PALETTES[id]
      for (const value of Object.values(p)) {
        expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
      expect(p.terra).toBe(colors.terra)
      expect(p.danger).toBe(colors.danger)
    }
  })

  it('纸底/卡面/分隔线三主题各不相同（换装可见）', () => {
    const papers = new Set(APP_THEMES.map((t) => PALETTES[t.id].paper))
    expect(papers.size).toBe(3)
  })
})

describe('theme: 解析与持久化键', () => {
  it('parseTheme：合法值原样返回，未知/空/非串回退默认', () => {
    expect(parseTheme('ticket')).toBe('ticket')
    expect(parseTheme('sage')).toBe('sage')
    expect(parseTheme('blue')).toBe(DEFAULT_THEME)
    expect(parseTheme(null)).toBe(DEFAULT_THEME)
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME)
    expect(parseTheme(42)).toBe(DEFAULT_THEME)
  })

  it('isAppTheme 只认三个合法 id', () => {
    expect(isAppTheme('warm')).toBe(true)
    expect(isAppTheme('nope')).toBe(false)
  })

  it('paletteFor 对任意输入都返回调色板', () => {
    expect(paletteFor('ticket')).toBe(PALETTES.ticket)
    expect(paletteFor('garbage')).toBe(PALETTES.warm)
    expect(paletteFor(null)).toBe(PALETTES.warm)
  })

  it('持久化键与 meta 表约定一致', () => {
    expect(THEME_META_KEY).toBe('app_theme')
  })
})
