// TASK-UX-01 第 2、3 项回归断言：画廊布局偏好持久化 + 顶部 chips 行不塌陷 + 列表窗口化调参。

import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { getMeta } from '../../sync/meta'
import {
  DEFAULT_GALLERY_LAYOUT,
  GALLERY_CHIP_ROW_HEIGHT,
  GALLERY_LAYOUT_META_KEY,
  GALLERY_LAYOUTS,
  galleryChipScrollStyle,
  galleryListKey,
  galleryListTuning,
  isGalleryLayout,
  loadGalleryLayout,
  parseGalleryLayout,
  saveGalleryLayout,
  toggleGalleryLayout,
  type GalleryLayout,
} from '../galleryLayout'

function setup(): SqlDatabase {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return db
}

describe('galleryLayout: 偏好解析与持久化', () => {
  it('默认双栏；未知/空值一律回退默认', () => {
    expect(DEFAULT_GALLERY_LAYOUT).toBe('grid')
    for (const bad of [undefined, null, '', 'GRID', 'two', 0, {}, []]) {
      expect(parseGalleryLayout(bad)).toBe('grid')
      expect(isGalleryLayout(bad)).toBe(false)
    }
    expect(parseGalleryLayout('list')).toBe('list')
    expect(parseGalleryLayout('grid')).toBe('grid')
  })

  it('切换在两种布局间往返', () => {
    expect(toggleGalleryLayout('grid')).toBe('list')
    expect(toggleGalleryLayout('list')).toBe('grid')
  })

  it('落库后冷启动读回（meta 键 gallery_layout）', () => {
    const db = setup()
    expect(loadGalleryLayout(db)).toBe('grid')

    saveGalleryLayout(db, 'list')
    expect(loadGalleryLayout(db)).toBe('list')
    expect(getMeta<string>(db, GALLERY_LAYOUT_META_KEY)).toBe('list')

    saveGalleryLayout(db, 'grid')
    expect(loadGalleryLayout(db)).toBe('grid')
  })

  it('脏值不落库：写非法布局按默认口径存 grid', () => {
    const db = setup()
    saveGalleryLayout(db, 'nonsense' as GalleryLayout)
    expect(getMeta<string>(db, GALLERY_LAYOUT_META_KEY)).toBe('grid')
  })

  it('开关项口径：双栏在前（默认），单栏在后', () => {
    expect(GALLERY_LAYOUTS.map((l) => l.id)).toEqual(['grid', 'list'])
    expect(GALLERY_LAYOUTS.every((l) => l.name && l.icon)).toBe(true)
  })
})

describe('galleryLayout: 顶部 chips 行不塌陷（重叠根因回归）', () => {
  it('锁死收缩并给高度下限，横向 ScrollView 不再被挤到内容高度以下', () => {
    expect(galleryChipScrollStyle.flexGrow).toBe(0)
    // RN 的 baseHorizontal 自带 flexShrink: 1，只覆盖 flexGrow 时该行会被压扁 → chips 盖住下一行。
    expect(galleryChipScrollStyle.flexShrink).toBe(0)
    expect(galleryChipScrollStyle.minHeight).toBe(GALLERY_CHIP_ROW_HEIGHT)
  })

  it('高度口径 = chip 最小高 34 + 上下 padding 6×2', () => {
    expect(GALLERY_CHIP_ROW_HEIGHT).toBe(34 + 6 * 2)
  })
})

describe('galleryLayout: 列表窗口化调参', () => {
  it('双栏 2 列 / 单栏 1 列', () => {
    expect(galleryListTuning('grid').numColumns).toBe(2)
    expect(galleryListTuning('list').numColumns).toBe(1)
  })

  it('窗口化参数收敛（默认 windowSize 21 屏，太吃图片解码）', () => {
    for (const layout of ['grid', 'list'] as GalleryLayout[]) {
      const t = galleryListTuning(layout)
      expect(t.windowSize).toBeLessThanOrEqual(5)
      expect(t.initialNumToRender).toBeLessThanOrEqual(8)
      expect(t.maxToRenderPerBatch).toBeLessThanOrEqual(8)
      expect(t.removeClippedSubviews).toBe(true)
      expect(t.updateCellsBatchingPeriod).toBeGreaterThan(0)
    }
  })

  it('换列数必须换 FlatList key（numColumns 不支持热切换）', () => {
    expect(galleryListKey('entry', 'grid')).not.toBe(galleryListKey('entry', 'list'))
    expect(galleryListKey('entry', 'grid')).not.toBe(galleryListKey('place', 'grid'))
  })
})
