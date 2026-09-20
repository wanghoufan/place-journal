// 草稿接力（记录页 → AI 确认页）的语义回归：只在内存、读不消费、显式清空。

import { clearDraft, consumeDraftSaved, markDraftSaved, setDraft, takeDraft, type RecordDraft } from '../draft'

function sample(overrides: Partial<RecordDraft> = {}): RecordDraft {
  return {
    assets: [{ uri: 'file:///a.jpg', width: 100, height: 200 }],
    newPlace: { name: '海边咖啡', area: '海口' },
    visitDate: '2026-09-20',
    rating: 5,
    budget: 45,
    notePrivate: '很安静',
    notePublic: '适合聊天',
    tagIds: ['t1'],
    ...overrides,
  }
}

describe('draft: 记录 → AI 确认 的内存接力', () => {
  afterEach(() => clearDraft())

  it('没有草稿时返回 null（AI 确认页据此回退独立输入）', () => {
    clearDraft()
    expect(takeDraft()).toBeNull()
  })

  it('setDraft 后原样取回（照片顺序、地点、感受、标签都不丢）', () => {
    const draft = sample()
    setDraft(draft)
    expect(takeDraft()).toEqual(draft)
    expect(takeDraft()?.assets[0].uri).toBe('file:///a.jpg')
  })

  it('takeDraft 只读不清空：确认页重渲染不会把草稿读没', () => {
    setDraft(sample())
    expect(takeDraft()).not.toBeNull()
    expect(takeDraft()).not.toBeNull()
  })

  it('clearDraft 后取回 null（保存成功后清空）', () => {
    setDraft(sample())
    clearDraft()
    expect(takeDraft()).toBeNull()
  })

  it('后写覆盖前写：同一会话连续两次记录只保留最新草稿', () => {
    setDraft(sample({ notePrivate: '第一次' }))
    setDraft(sample({ notePrivate: '第二次' }))
    expect(takeDraft()?.notePrivate).toBe('第二次')
  })
})

// 记录页在 tab 栈里常驻（Web 是路由切换即卸载），保存后必须靠信号显式复位表单，
// 否则回到记录 tab 再点保存会建出第二条记录。
describe('draft: 保存完成信号（记录页复位依据）', () => {
  afterEach(() => {
    clearDraft()
    consumeDraftSaved()
  })

  it('默认未置位；置位后消费一次即清（不重复复位）', () => {
    expect(consumeDraftSaved()).toBe(false)
    markDraftSaved()
    expect(consumeDraftSaved()).toBe(true)
    expect(consumeDraftSaved()).toBe(false)
  })

  it('新一次接力（setDraft）会清掉上一轮的保存信号', () => {
    markDraftSaved()
    setDraft(sample())
    expect(consumeDraftSaved()).toBe(false)
  })

  it('返回修改（未保存）不会置位：记录页据此保留已填内容', () => {
    setDraft(sample())
    takeDraft()
    expect(consumeDraftSaved()).toBe(false)
  })
})
