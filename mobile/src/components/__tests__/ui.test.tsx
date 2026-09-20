// 对比度回归（TASK-DEV-UI对比度）：primary 按钮底色恒为 terra、文字恒为 white。
// 曾出错因：调用方把带 backgroundColor 的样式（如页面级 `flex: { flex:1, backgroundColor: paper }`）
// 传给 AppButton，而 style 在样式数组里排最后，纸色底盖掉 terra → 白字看不见。
// 这里直接对渲染结果断言（不用 Pressable 组件类型查找，jest-expo 下无法按组件名命中）。

import TestRenderer from 'react-test-renderer'
import type { ReactTestRendererJSON } from 'react-test-renderer'
import type { ComponentProps } from 'react'
import { StyleSheet, TextInput } from 'react-native'

import { AppButton, InlineTagCreator } from '../ui'
import { colors } from '../../theme'

type Node = ReactTestRendererJSON

function renderButton(props: Partial<ComponentProps<typeof AppButton>> = {}) {
  let renderer: TestRenderer.ReactTestRenderer | null = null
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<AppButton label="使用 Google 登录" onPress={() => {}} {...props} />)
  })
  return renderer as unknown as TestRenderer.ReactTestRenderer
}

function descendants(node: Node): Node[] {
  // children 里可能混着纯文本字符串，只保留元素节点。
  const children = (node.children ?? []).filter((child): child is Node => typeof child !== 'string')
  return children.flatMap((child) => [child, ...descendants(child)])
}

function tree(renderer: TestRenderer.ReactTestRenderer): Node {
  const json = renderer.toJSON()
  if (!json || Array.isArray(json)) throw new Error('渲染结果为空')
  return json as Node
}

/** 按钮节点：宿主 View，带 accessibilityRole=button。 */
function buttonNode(renderer: TestRenderer.ReactTestRenderer): Node {
  const root = tree(renderer)
  const node = [root, ...descendants(root)].find((n) => n.props.accessibilityRole === 'button')
  if (!node) throw new Error('未找到按钮节点')
  return node
}

/** 实际生效样式：按数组顺序合并（后写覆盖先写），与运行时一致。 */
function buttonStyle(renderer: TestRenderer.ReactTestRenderer) {
  return StyleSheet.flatten(buttonNode(renderer).props.style) as Record<string, unknown>
}

function buttonTextStyle(renderer: TestRenderer.ReactTestRenderer) {
  const node = descendants(buttonNode(renderer)).find((n) => n.type === 'Text')
  if (!node) throw new Error('未找到按钮文字')
  return StyleSheet.flatten(node.props.style) as Record<string, unknown>
}

describe('AppButton 对比度', () => {
  it('primary 渲染后底色恒为 terra、文字 white', () => {
    const renderer = renderButton({ variant: 'primary' })
    expect(buttonStyle(renderer).backgroundColor).toBe(colors.terra)
    expect(buttonTextStyle(renderer).color).toBe(colors.white)
    TestRenderer.act(() => renderer.unmount())
  })

  it('调用方传入带 backgroundColor 的 style 也盖不掉 primary 底色（本次 bug 的回归断言）', () => {
    // 复刻 mine.tsx 旧写法：整页样式（含纸色底）顺手传给了按钮。
    const renderer = renderButton({ variant: 'primary', style: { flex: 1, backgroundColor: colors.paper } })
    const style = buttonStyle(renderer)
    expect(style.backgroundColor).toBe(colors.terra)
    expect(style.flex).toBe(1)
    expect(buttonTextStyle(renderer).color).toBe(colors.white)
    TestRenderer.act(() => renderer.unmount())
  })

  it('禁用态不靠整体降透明度：实色 terraDeep 底 + 白字仍可读', () => {
    const renderer = renderButton({ variant: 'primary', disabled: true })
    const style = buttonStyle(renderer)
    expect(style.backgroundColor).toBe(colors.terraDeep)
    expect(style.opacity).toBeUndefined()
    expect(buttonTextStyle(renderer).color).toBe(colors.white)
    TestRenderer.act(() => renderer.unmount())
  })

  it('loading 态同样保持可读底色与文字', () => {
    const renderer = renderButton({ variant: 'primary', loading: true })
    expect(buttonStyle(renderer).backgroundColor).toBe(colors.terraDeep)
    expect(buttonTextStyle(renderer).color).toBe(colors.white)
    TestRenderer.act(() => renderer.unmount())
  })

  it('其余 variant 底色/文字未被影响', () => {
    const secondary = renderButton({ variant: 'secondary' })
    expect(buttonStyle(secondary).backgroundColor).toBe(colors.card)
    expect(buttonTextStyle(secondary).color).toBe(colors.ink)
    TestRenderer.act(() => secondary.unmount())

    const danger = renderButton({ variant: 'danger' })
    expect(buttonStyle(danger).backgroundColor).toBe(colors.danger)
    expect(buttonTextStyle(danger).color).toBe(colors.white)
    TestRenderer.act(() => danger.unmount())

    const ghost = renderButton({ variant: 'ghost' })
    expect(buttonStyle(ghost).backgroundColor).toBe('transparent')
    expect(buttonTextStyle(ghost).color).toBe(colors.terraDeep)
    TestRenderer.act(() => ghost.unmount())
  })
})

// 现场建标签控件（Record / Entry 编辑共用）：空名不能提交，输入后按钮可用，
// 提交时回调拿到的是去空白后的名字，且输入框自清空。
function renderTagCreator(onCreate: (name: string) => void) {
  let renderer: TestRenderer.ReactTestRenderer | null = null
  TestRenderer.act(() => {
    renderer = TestRenderer.create(<InlineTagCreator onCreate={onCreate} />)
  })
  return renderer as unknown as TestRenderer.ReactTestRenderer
}

function createButton(renderer: TestRenderer.ReactTestRenderer) {
  const json = renderer.toJSON()
  if (!json || Array.isArray(json)) throw new Error('渲染结果为空')
  const root = json as Node
  const node = [root, ...descendants(root)].find(
    (n) =>
      n.props.accessibilityRole === 'button' &&
      descendants(n).some((child) => (child.children ?? []).includes('新建')),
  )
  if (!node) throw new Error('未找到「新建」按钮')
  return node
}

describe('InlineTagCreator 现场建标签', () => {
  it('空输入时「新建」按钮禁用，且带可访问标签的输入框在位', () => {
    const renderer = renderTagCreator(() => {})
    const json = renderer.toJSON() as Node
    const input = [json, ...descendants(json)].find((n) => n.props.accessibilityLabel === '现场建标签')
    expect(input).toBeTruthy()
    expect(createButton(renderer).props.accessibilityState?.disabled).toBe(true)
    TestRenderer.act(() => renderer.unmount())
  })

  it('输入名字后按钮可用，提交回调拿到去空白名字并清空输入', () => {
    const created: string[] = []
    const renderer = renderTagCreator((name) => created.push(name))
    const input = renderer.root.findAllByType(TextInput)[0]
    TestRenderer.act(() => input.props.onChangeText('  露台  '))
    expect(createButton(renderer).props.accessibilityState?.disabled).toBe(false)

    TestRenderer.act(() => input.props.onSubmitEditing())
    expect(created).toEqual(['露台'])
    expect(renderer.root.findAllByType(TextInput)[0].props.value).toBe('')
    TestRenderer.act(() => renderer.unmount())
  })

  it('busy 时按钮禁用（父级正在落库，避免重复建）', () => {
    const renderer = renderTagCreator(() => {})
    TestRenderer.act(() => renderer.update(<InlineTagCreator busy onCreate={() => {}} />))
    expect(createButton(renderer).props.accessibilityState?.disabled).toBe(true)
    TestRenderer.act(() => renderer.unmount())
  })
})
