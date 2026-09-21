// 移动端配色（暖纸 / 票根 / 竹青，与现役 Web `src/lib/theme.ts` 三主题同名同源）。
// 仅放色值与触控尺寸常量，不含组件、不 import Expo。
//
// 兼容口径：`colors` 仍导出「暖纸手账」调色板，值与旧单主题逐字一致（既有 import 不受影响）；
// 三主题差异集中在纸底/卡面/分隔线（paper/card/cardDeep/line），强调色（terra/moss/danger）
// 三主题共用，保证只换纸色的页面与未接入主题的组件仍视觉一致。

export type AppTheme = 'warm' | 'ticket' | 'sage'

export interface Palette {
  paper: string
  card: string
  cardDeep: string
  ink: string
  inkMuted: string
  line: string
  terra: string
  terraDeep: string
  terraSoft: string
  moss: string
  mossSoft: string
  danger: string
  dangerSoft: string
  white: string
}

/** 暖纸手账（默认主题）。 */
export const colors: Palette = {
  paper: '#FBF6EC',
  card: '#FFFDF7',
  cardDeep: '#F2EAD6',
  ink: '#3B342A',
  inkMuted: '#8A7F6D',
  line: '#E9E0CB',
  terra: '#C4602F',
  terraDeep: '#A8491F',
  terraSoft: '#F6E7DC',
  moss: '#6B7A52',
  mossSoft: '#E8EDDD',
  danger: '#B3421F',
  dangerSoft: '#F7E7E0',
  white: '#FFFFFF',
}

const SHARED_ACCENTS = {
  terra: colors.terra,
  terraDeep: colors.terraDeep,
  terraSoft: colors.terraSoft,
  moss: colors.moss,
  mossSoft: colors.mossSoft,
  danger: colors.danger,
  dangerSoft: colors.dangerSoft,
  white: colors.white,
} as const

export const PALETTES: Record<AppTheme, Palette> = {
  warm: colors,
  ticket: {
    ...SHARED_ACCENTS,
    paper: '#F6EFE0',
    card: '#FFFBF2',
    cardDeep: '#E9DAC0',
    ink: '#3B342A',
    inkMuted: '#8A7F6D',
    line: '#E0D0B2',
  },
  sage: {
    ...SHARED_ACCENTS,
    paper: '#F4F6F0',
    card: '#FDFEFB',
    cardDeep: '#E4EBDA',
    ink: '#333A2E',
    inkMuted: '#7C8571',
    line: '#DCE3D1',
  },
}

/** 主题清单（名称与 Web `APP_THEMES` 逐字一致，供 Mine 的切换器展示）。 */
export const APP_THEMES: { id: AppTheme; name: string; swatch: string }[] = [
  { id: 'warm', name: '暖纸手账', swatch: '#efe7d7' },
  { id: 'ticket', name: '票根台账', swatch: '#e9dac0' },
  { id: 'sage', name: '竹青园林', swatch: '#f4f6f0' },
]

export const DEFAULT_THEME: AppTheme = 'warm'

/** meta 表键名（本地持久化当前主题）。 */
export const THEME_META_KEY = 'app_theme'

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'warm' || value === 'ticket' || value === 'sage'
}

/** 任意值 → 合法主题；未知/空一律回退默认主题（老库无此键时同口径）。 */
export function parseTheme(value: unknown): AppTheme {
  return isAppTheme(value) ? value : DEFAULT_THEME
}

/** 主题 → 调色板（未知值回退默认，绝不返回 undefined）。 */
export function paletteFor(theme: AppTheme | string | null | undefined): Palette {
  return PALETTES[parseTheme(theme)]
}

/** 移动端最小触控高度（Android 推荐 48dp，此处取 44+）。 */
export const TOUCH_HEIGHT = 48
