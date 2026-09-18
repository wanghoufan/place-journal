import {
  createPlaceholderOrganiser,
  localHeuristics,
  OrganiseTimeoutError,
  runOrganise,
  type Organiser,
} from '../organise'

describe('organise: 本地启发式占位', () => {
  const tags = [
    { id: 't1', name: '安静' },
    { id: 't2', name: '适合拍照' },
  ]

  it('提取预算、评分与摘要，并命中既有标签', () => {
    const result = localHeuristics({
      transcript: '晚上很安静，适合拍照，人均45，超赞。',
      tags,
    })

    expect(result.budget).toBe(45)
    expect(result.rating).toBe(5)
    expect(result.summary).toBe('晚上很安静，适合拍照，人均45，超赞')
    expect(result.matchedTags.sort()).toEqual(['t1', 't2'])
    expect(result.mock).toBe(true)
  })

  it('无文字时用地点名兜底，不猜评分', () => {
    const result = localHeuristics({ placeName: '海边咖啡', area: '海口', tags })
    expect(result.summary).toBe('海边咖啡 · 海口')
    expect(result.rating).toBeUndefined()
    expect(result.matchedTags).toEqual([])
  })
})

describe('organise: 超时与降级', () => {
  it('空文字直接 skipped（empty），不调 organiser', async () => {
    let called = false
    const organiser: Organiser = {
      organise: async () => {
        called = true
        return localHeuristics({ tags: [] })
      },
    }
    const result = await runOrganise({ transcript: '   ', tags: [] }, { organiser })
    expect(result).toEqual({ status: 'skipped', reason: 'empty' })
    expect(called).toBe(false)
  })

  it('占位 organiser 正常返回建议', async () => {
    const result = await runOrganise(
      { transcript: '人均30，还不错', tags: [] },
      { organiser: createPlaceholderOrganiser() },
    )
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.suggestion.budget).toBe(30)
  })

  it('超时返回 timeout，供 UI 跳过手工保存', async () => {
    const slow: Organiser = {
      organise: () => new Promise((resolve) => setTimeout(() => resolve(localHeuristics({ tags: [] })), 50)),
    }
    const result = await runOrganise({ transcript: '你好', tags: [] }, { organiser: slow, timeoutMs: 10 })
    expect(result).toEqual({ status: 'timeout' })
  })

  it('organiser 抛错 → skipped(error)，不抛出', async () => {
    const broken: Organiser = {
      organise: async () => {
        throw new Error('boom')
      },
    }
    const result = await runOrganise({ transcript: '你好', tags: [] }, { organiser: broken, timeoutMs: 50 })
    expect(result).toEqual({ status: 'skipped', reason: 'error' })
  })

  it('OrganiseTimeoutError 类型可用于识别', () => {
    expect(new OrganiseTimeoutError(1000).name).toBe('OrganiseTimeoutError')
  })
})
