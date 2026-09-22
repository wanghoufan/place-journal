// 画廊视图偏好与列表调参（TASK-UX-01 第 2、3 项）：本机 `meta` 持久化，默认双栏网格。
//
// 只放纯逻辑与常量，不 import Expo，便于单测；UI 侧（`app/(tabs)/index.tsx`）直接取用。
// 命名与口径对齐 `src/theme.ts`（THEME_META_KEY / parseTheme / DEFAULT_THEME 那套）。

import type { SqlDatabase } from '../db/database'
import { getMeta, setMeta } from '../sync/meta'

/** 单栏（清单行卡）/ 双栏（两列网格）。 */
export type GalleryLayout = 'grid' | 'list'

/** meta 表键名（本地持久化画廊布局）。 */
export const GALLERY_LAYOUT_META_KEY = 'gallery_layout'

/** 默认双栏（对齐 Web 画廊的网格观感）。 */
export const DEFAULT_GALLERY_LAYOUT: GalleryLayout = 'grid'

export const GALLERY_LAYOUTS: { id: GalleryLayout; name: string; icon: string }[] = [
  { id: 'grid', name: '双栏', icon: '▦' },
  { id: 'list', name: '单栏', icon: '☰' },
]

export function isGalleryLayout(value: unknown): value is GalleryLayout {
  return value === 'grid' || value === 'list'
}

/** 任意值 → 合法布局；未知/空一律回退默认（老库无此键时同口径）。 */
export function parseGalleryLayout(value: unknown): GalleryLayout {
  return isGalleryLayout(value) ? value : DEFAULT_GALLERY_LAYOUT
}

export function toggleGalleryLayout(layout: GalleryLayout): GalleryLayout {
  return layout === 'grid' ? 'list' : 'grid'
}

/** 冷启动读回上次选择；库不可用由调用方 try/catch 兜底。 */
export function loadGalleryLayout(db: SqlDatabase): GalleryLayout {
  return parseGalleryLayout(getMeta<string>(db, GALLERY_LAYOUT_META_KEY))
}

export function saveGalleryLayout(db: SqlDatabase, layout: GalleryLayout): void {
  setMeta(db, GALLERY_LAYOUT_META_KEY, parseGalleryLayout(layout))
}

/**
 * 顶部场景 chips 行高度（chip minHeight 34 + 上下 padding 6）。
 *
 * 修的是「chips 行与下方浏览行重叠」：横向 ScrollView 自带 `flexShrink: 1`
 * （RN baseHorizontal），原先只覆盖了 `flexGrow: 0`，列内空间不足时这一行会被压到
 * 内容高度以下，chips 直接盖到下一行上。这里给死下限 + 禁止收缩。
 */
export const GALLERY_CHIP_ROW_HEIGHT = 46

export const galleryChipScrollStyle = {
  flexGrow: 0,
  flexShrink: 0,
  minHeight: GALLERY_CHIP_ROW_HEIGHT,
} as const

/**
 * 画廊列表 `contentContainerStyle` 的左右内衬（空态滚动容器同口径）。
 *
 * 顶栏（TASK-UX-02）已挂进列表 Header，要整幅贴边：用 `marginHorizontal: -GALLERY_LIST_PADDING`
 * 抵掉这层内衬，顶栏各行的 `paddingHorizontal: 16` 才对得齐屏幕边缘、chips 才能滚到最边。
 */
export const GALLERY_LIST_PADDING = 12

/** FlatList 窗口化调参（默认 windowSize 21 = 21 屏，配合图片解码明显吃内存/掉帧）。 */
export interface GalleryListTuning {
  numColumns: number
  initialNumToRender: number
  maxToRenderPerBatch: number
  windowSize: number
  removeClippedSubviews: boolean
  updateCellsBatchingPeriod: number
}

export function galleryListTuning(layout: GalleryLayout): GalleryListTuning {
  return layout === 'grid'
    ? {
        numColumns: 2,
        initialNumToRender: 6,
        maxToRenderPerBatch: 8,
        windowSize: 5,
        removeClippedSubviews: true,
        updateCellsBatchingPeriod: 50,
      }
    : {
        numColumns: 1,
        initialNumToRender: 8,
        maxToRenderPerBatch: 8,
        windowSize: 5,
        removeClippedSubviews: true,
        updateCellsBatchingPeriod: 50,
      }
}

/**
 * FlatList 的 key：`numColumns` 不支持热切换，换列数必须换 key 强制重挂（RN 硬性要求）。
 * 视图维度（按记录 / 按地点）一并带上，避免两种数据源共用缓存。
 */
export function galleryListKey(mode: 'entry' | 'place', layout: GalleryLayout): string {
  return `${mode}-${layout}`
}
