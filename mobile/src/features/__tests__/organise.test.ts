import {
  createDefaultOrganiser,
  createHttpOrganiser,
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

describe('organise: 真网 Organiser（TASK-PWA-AI-01）', () => {
  const tags = [
    { id: 't1', name: '安静' },
    { id: 't2', name: '适合拍照' },
  ]
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.EXPO_PUBLIC_AI_API_BASE
  })

  function mockFetch(response: unknown, status = 200) {
    const calls: { url: string; init?: RequestInit }[] = []
    const impl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: status >= 200 && status < 300, status, json: async () => response }
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  it('成功：带上正文调服务端，映射为建议（mock=false，标签名换成本地 id）', async () => {
    const { impl, calls } = mockFetch({
      ok: true,
      provider: 'deepseek',
      model: 'deepseek-flash',
      result: {
        score: 4,
        budget: 45,
        cleaned_transcript: '晚上很安静，适合拍照，人均45。',
        public_reason: '夜景超美，很适合拍照。',
        matched_tags: ['安静', '不存在的标签'],
        unmatched_suggestions: ['露台'],
      },
    })
    const organiser = createHttpOrganiser({ baseUrl: 'https://ai.example.com/', fetchImpl: impl })
    const suggestion = await organiser.organise({ transcript: '晚上很安静，人均45', tags })

    expect(calls[0].url).toBe('https://ai.example.com/api/ai-organize')
    expect(calls[0].init?.method).toBe('POST')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.transcript).toBe('晚上很安静，人均45')
    expect(body.tags).toEqual([{ name: '安静', dimension: '' }, { name: '适合拍照', dimension: '' }])
    expect(body).not.toHaveProperty('apiKey')
    expect(suggestion.mock).toBe(false)
    expect(suggestion.rating).toBe(4)
    expect(suggestion.budget).toBe(45)
    expect(suggestion.summary).toBe('夜景超美，很适合拍照')
    expect(suggestion.matchedTags).toEqual(['t1'])
    expect(suggestion.unmatched).toEqual(['露台'])
  })

  it('501（服务端未配 Key）→ 回退本地占位，不抛出', async () => {
    const { impl } = mockFetch({ ok: false, reason: 'not_configured' }, 501)
    const organiser = createHttpOrganiser({ baseUrl: 'https://ai.example.com', fetchImpl: impl })
    const input = { transcript: '晚上很安静，人均45', tags }
    const suggestion = await organiser.organise(input)

    expect(suggestion).toEqual(localHeuristics(input))
    expect(suggestion.mock).toBe(true)
  })

  it('超时（abort）→ 回退本地占位，不抛出', async () => {
    const hangingFetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })))
      })) as unknown as typeof fetch
    const organiser = createHttpOrganiser({ baseUrl: 'https://ai.example.com', fetchImpl: hangingFetch, timeoutMs: 10 })
    const input = { transcript: '晚上很安静，人均45', tags }
    const suggestion = await organiser.organise(input)

    expect(suggestion.mock).toBe(true)
    expect(suggestion.budget).toBe(45)
  })

  it('返回体异常（ok 但无 result）→ 回退本地占位，不抛出', async () => {
    const { impl } = mockFetch({ ok: true })
    const organiser = createHttpOrganiser({ baseUrl: 'https://ai.example.com', fetchImpl: impl })
    const suggestion = await organiser.organise({ transcript: '超赞', tags })
    expect(suggestion.mock).toBe(true)
  })

  it('配了 EXPO_PUBLIC_AI_API_BASE 走真网；缺省保持本地占位（不发网）', async () => {
    const { impl, calls } = mockFetch({ ok: true, result: { score: 5, public_reason: '很好。' } })
    globalThis.fetch = impl
    process.env.EXPO_PUBLIC_AI_API_BASE = 'https://ai.example.com'
    const online = await createDefaultOrganiser().organise({ transcript: '超赞', tags })
    expect(calls).toHaveLength(1)
    expect(online.mock).toBe(false)

    delete process.env.EXPO_PUBLIC_AI_API_BASE
    calls.length = 0
    const offline = await createDefaultOrganiser().organise({ transcript: '超赞', tags })
    expect(calls).toHaveLength(0)
    expect(offline.mock).toBe(true)
  })

  it('真网失败也不阻断保存：runOrganise 包装后仍是 ok（本地兜底）', async () => {
    const { impl } = mockFetch({ ok: false }, 500)
    const organiser = createHttpOrganiser({ baseUrl: 'https://ai.example.com', fetchImpl: impl })
    const result = await runOrganise({ transcript: '人均30，还不错', tags }, { organiser })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.suggestion.mock).toBe(true)
      expect(result.suggestion.budget).toBe(30)
    }
  })
})
