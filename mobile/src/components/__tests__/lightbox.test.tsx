// 灯箱渲染回归：空图不渲染、计数/封面角标、单图不出圆点、非封面位给「设为封面」。

import TestRenderer from 'react-test-renderer'
import type { ReactTestRendererJSON } from 'react-test-renderer'
import type { ComponentProps } from 'react'

import { Lightbox } from '../Lightbox'

type Node = ReactTestRendererJSON

function render(props: Partial<ComponentProps<typeof Lightbox>> = {}) {
  const base: ComponentProps<typeof Lightbox> = {
    visible: true,
    images: ['file:///a.jpg', 'file:///b.jpg'],
    index: 0,
    onIndex: () => {},
    onClose: () => {},
    coverIndex: 0,
    onSetCover: () => {},
  }
  let renderer: TestRenderer.ReactTestRenderer | null = null
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<Lightbox {...base} {...props} />)
  })
  return renderer as unknown as TestRenderer.ReactTestRenderer
}

function descendants(node: Node): Node[] {
  const children = (node.children ?? []).filter((child): child is Node => typeof child !== 'string')
  return children.flatMap((child) => [child, ...descendants(child)])
}

function allNodes(renderer: TestRenderer.ReactTestRenderer): Node[] {
  const json = renderer.toJSON()
  if (!json || Array.isArray(json)) return []
  const root = json as Node
  return [root, ...descendants(root)]
}

function texts(renderer: TestRenderer.ReactTestRenderer): string[] {
  const out: string[] = []
  for (const node of allNodes(renderer)) {
    for (const child of node.children ?? []) if (typeof child === 'string') out.push(child)
  }
  return out
}

function labels(renderer: TestRenderer.ReactTestRenderer): string[] {
  return allNodes(renderer)
    .map((node) => node.props.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string')
}

describe('Lightbox 灯箱相册', () => {
  it('没有照片时不渲染（父级无需自己判断）', () => {
    const renderer = render({ images: [] })
    expect(renderer.toJSON()).toBeNull()
    TestRenderer.act(() => renderer.unmount())
  })

  it('首图：显示 1 / 2 与「封面」角标，不给「设为封面」按钮', () => {
    const renderer = render({ index: 0, coverIndex: 0 })
    expect(texts(renderer)).toEqual(expect.arrayContaining(['1 / 2', '封面']))
    expect(labels(renderer)).not.toContain('设为封面')
    expect(labels(renderer)).toContain('关闭预览')
    TestRenderer.act(() => renderer.unmount())
  })

  it('非封面位：显示 2 / 2 与「设为封面」，不再显示封面角标', () => {
    const renderer = render({ index: 1, coverIndex: 0 })
    expect(texts(renderer)).toEqual(expect.arrayContaining(['2 / 2']))
    expect(texts(renderer)).not.toContain('封面')
    expect(labels(renderer)).toContain('设为封面')
    TestRenderer.act(() => renderer.unmount())
  })

  it('单图不渲染翻页圆点；多图渲染圆点', () => {
    const single = render({ images: ['file:///a.jpg'] })
    expect(labels(single)).not.toContain('第 1 张')
    TestRenderer.act(() => single.unmount())

    const multi = render()
    expect(labels(multi)).toEqual(expect.arrayContaining(['第 1 张', '第 2 张']))
    TestRenderer.act(() => multi.unmount())
  })

  it('不传 onSetCover 时不提供设为封面入口', () => {
    const renderer = render({ index: 1, onSetCover: undefined })
    expect(labels(renderer)).not.toContain('设为封面')
    expect(texts(renderer)).not.toContain('封面')
    TestRenderer.act(() => renderer.unmount())
  })
})
