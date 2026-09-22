// TASK-UX-02 回归：画廊顶栏（标题 + 场景 chips + 浏览/布局）必须挂在列表 Header 上——
// 上滑随内容滚走、下拉回到顶，不做吸顶；且切筛选/切布局后行为不变。
//
// 只打桩数据层（仓库句柄 + 两条列表查询），过滤/聚合仍走真实纯函数，
// 断言的是屏幕真实结构，而不是某个替身组件。

import TestRenderer from 'react-test-renderer'
import type { ReactTestRendererJSON } from 'react-test-renderer'
import { FlatList, Text } from 'react-native'

import GalleryScreen from '../../app/(tabs)/index'
import type { GalleryEntry } from '@/features/queries'

const mockEntries: GalleryEntry[] = [
  entryOf('e1', 'p1', ['scene-1']),
  entryOf('e2', 'p1', ['scene-1']),
  entryOf('e3', 'p2', []),
]

jest.mock('@/db/app', () => ({
  getAppRepository: () => ({ db: { getFirstSync: () => undefined, runSync: () => {} }, repo: {} }),
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  // 渲染即当作页面获得焦点（useEffect 语义），与真实 useFocusEffect 的首次触发等价。
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))

jest.mock('@/features/queries', () => ({
  ...jest.requireActual('@/features/queries'),
  listGalleryEntries: () => mockEntries,
  listTagsGrouped: () => [
    {
      dimension: { id: 'd1', name: '场景', kind: 'scene', sortOrder: 0 },
      tags: [
        { id: 'scene-1', dimensionId: 'd1', parentId: null, name: '拍照打卡', sortOrder: 0, usage: 2 },
      ],
    },
  ],
}))

function entryOf(id: string, placeId: string, tagIds: string[]): GalleryEntry {
  return {
    id,
    placeId,
    placeName: `地点${placeId}`,
    placeArea: '西湖区',
    visitDate: '2026-09-01',
    rating: 4,
    mediaCount: 1,
    isPrivate: false,
    revision: 1,
    baseRevision: null,
    demo: false,
    syncStatus: 'synced',
    createdAt: `2026-09-01T00:00:0${id.length}Z`,
    updatedAt: `2026-09-01T00:00:0${id.length}Z`,
    tagIds,
  }
}

type Node = ReactTestRendererJSON
type Renderer = TestRenderer.ReactTestRenderer

function isElement(child: unknown): child is Node {
  return typeof child === 'object' && child !== null
}

function descendants(node: Node): Node[] {
  const children = (node.children ?? []).filter(isElement)
  return children.flatMap((child) => [child, ...descendants(child)])
}

function tree(renderer: Renderer): Node {
  const json = renderer.toJSON()
  if (!json || Array.isArray(json)) throw new Error('渲染结果为空')
  return json as Node
}

function allNodes(renderer: Renderer): Node[] {
  const root = tree(renderer)
  return [root, ...descendants(root)]
}

/** 某棵子树里所有 Text 的可见文字。 */
function textsIn(node: Node): string[] {
  return [node, ...descendants(node)]
    .filter((n) => n.type === 'Text')
    .flatMap((n) => (n.children ?? []).filter((c): c is string => typeof c === 'string'))
}

function texts(renderer: Renderer): string[] {
  return textsIn(tree(renderer))
}

/** 最外层滚动容器（列表本体；顶栏 chips 的横向 ScrollView 比它更深一层）。 */
function outerScroll(renderer: Renderer): Node {
  const node = allNodes(renderer).find((n) => n.type === 'RCTScrollView')
  if (!node) throw new Error('未找到外层滚动容器')
  return node
}

/**
 * 根节点下的并列分支数：滚动容器之外若还挂着固定顶栏，这里会 > 1。
 * （列表态根是包一层的 View，空态根就是 ScrollView 本身，两种都只有一条分支。）
 */
function rootBranches(renderer: Renderer): Node[] {
  const root = tree(renderer)
  return (root.children ?? []).filter(isElement)
}

function renderScreen(): Renderer {
  let renderer: Renderer | null = null
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<GalleryScreen />)
  })
  return renderer as unknown as Renderer
}

/**
 * 按可见文字找按钮并触发 onPress。
 * 不用 findAllByType(Pressable)：jest-expo 下 Pressable 的模块身份与测试侧不一致，
 * 按「带 onPress 且子树含该文字」定位更稳。
 */
function pressByText(renderer: Renderer, label: string) {
  const target = renderer.root
    .findAll((node) => typeof node.props?.onPress === 'function')
    .find((node) =>
      node.findAllByType(Text).some((text) =>
        Array.isArray(text.props.children)
          ? text.props.children.includes(label)
          : text.props.children === label,
      ),
    )
  if (!target) throw new Error(`未找到按钮：${label}`)
  TestRenderer.act(() => target.props.onPress())
}

function pressByA11y(renderer: Renderer, label: string) {
  const target = renderer.root
    .findAll((node) => typeof node.props?.onPress === 'function')
    .find((node) => node.props.accessibilityLabel === label)
  if (!target) throw new Error(`未找到按钮：${label}`)
  TestRenderer.act(() => target.props.onPress())
}

function flatList(renderer: Renderer) {
  return renderer.root.findByType(FlatList)
}

describe('画廊顶栏跟随滚动（TASK-UX-02）', () => {
  it('顶栏在列表滚动容器内部，不是固定兄弟节点（上滑能整块滚走）', () => {
    const renderer = renderScreen()

    // 顶栏整块挂在滚动容器里：改造前它会作为 root 的第二条并列分支留在容器外。
    expect(rootBranches(renderer)).toHaveLength(1)
    const scrollTexts = textsIn(outerScroll(renderer))
    expect(scrollTexts).toContain('共 3 条记录')
    expect(scrollTexts.some((t) => t.includes('拍照打卡'))).toBe(true)
    expect(scrollTexts).toContain('浏览：')
    expect(scrollTexts).toContain('布局：')

    TestRenderer.act(() => renderer.unmount())
  })

  it('不做吸顶：Header 走 ListHeaderComponent，未设 stickyHeaderIndices', () => {
    const renderer = renderScreen()
    const list = flatList(renderer)
    expect(list.props.ListHeaderComponent).toBeTruthy()
    expect(list.props.stickyHeaderIndices).toBeUndefined()

    TestRenderer.act(() => renderer.unmount())
  })

  it('场景筛选照旧生效（点 chip 改计数），顶栏位置不变', () => {
    const renderer = renderScreen()
    pressByText(renderer, '拍照打卡')

    expect(texts(renderer)).toContain('共 2 / 3 条记录')
    expect(textsIn(outerScroll(renderer))).toContain('共 2 / 3 条记录')
    expect(rootBranches(renderer)).toHaveLength(1)

    TestRenderer.act(() => renderer.unmount())
  })

  it('切单双栏照旧生效（列数跟着变）', () => {
    const renderer = renderScreen()
    expect(flatList(renderer).props.numColumns).toBe(2)

    pressByA11y(renderer, '单栏清单')
    expect(flatList(renderer).props.numColumns).toBe(1)
    expect(flatList(renderer).props.columnWrapperStyle).toBeUndefined()

    pressByA11y(renderer, '双栏网格')
    expect(flatList(renderer).props.numColumns).toBe(2)

    TestRenderer.act(() => renderer.unmount())
  })

  it('按地点视图同样带顶栏（切视图不丢 Header）', () => {
    const renderer = renderScreen()
    pressByText(renderer, '按地点')

    expect(flatList(renderer).props.ListHeaderComponent).toBeTruthy()
    // 地点行把「去过 N 次」拆成多段 Text（`去过 {n} 次 · {日期}`），不断言整句，只认前缀。
    expect(texts(renderer).some((t) => t.includes('去过'))).toBe(true)

    TestRenderer.act(() => renderer.unmount())
  })

  it('空态也把顶栏放进滚动容器（位置与列表态一致）', () => {
    mockEntries.length = 0
    const renderer = renderScreen()

    const scrollTexts = textsIn(outerScroll(renderer))
    expect(scrollTexts).toContain('还没有记录')
    expect(scrollTexts).toContain('布局：')
    expect(rootBranches(renderer)).toHaveLength(1)

    TestRenderer.act(() => renderer.unmount())
  })
})
