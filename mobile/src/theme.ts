// 移动端配色（暖纸 / 票根 / 竹青，对齐现役 Web 暖纸主题的视觉口径）。
// 仅放色值与触控尺寸常量，不含组件。

export const colors = {
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
} as const

/** 移动端最小触控高度（Android 推荐 48dp，此处取 44+）。 */
export const TOUCH_HEIGHT = 48
