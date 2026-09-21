// AI 连通性探针：被动探针（只看 Key 配没配）与主动测试（真调一次、报通道+耗时）。

import { AI_PROBE_PAYLOAD, probeAiConfig, testAiConnectivity } from '../aiProbe'

type Call = { url: string; body: string }

/** 最小 Response 替身：只带探针用到的 status / ok / json。 */
function fakeResponse(status: number, payload?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload ?? {},
  } as unknown as Response
}

function fakeFetch(handler: (url: string, init: RequestInit | undefined) => Promise<Response>) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: String(init?.body ?? '') })
    return handler(url, init)
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('aiProbe: probeAiConfig 被动探针', () => {
  it('未填基地址 → 未配置（不发网）', async () => {
    const { impl, calls } = fakeFetch(async () => fakeResponse(400))
    const probe = await probeAiConfig({ baseUrl: '', fetchImpl: impl })
    expect(probe.state).toBe('missing-base')
    expect(calls).toHaveLength(0)
  })

  it('400 = Key 已配置；501 = 未配置', async () => {
    const a = await probeAiConfig({ baseUrl: 'https://ai.example.com', fetchImpl: fakeFetch(async () => fakeResponse(400)).impl })
    expect(a).toMatchObject({ state: 'configured', label: '已配置' })

    const b = await probeAiConfig({ baseUrl: 'https://ai.example.com', fetchImpl: fakeFetch(async () => fakeResponse(501)).impl })
    expect(b).toMatchObject({ state: 'unconfigured', label: '未配置' })
  })

  it('其它状态码 → 未部署(状态码)；网络失败 → 未部署（本地开发模式）', async () => {
    const c = await probeAiConfig({ baseUrl: 'https://ai.example.com', fetchImpl: fakeFetch(async () => fakeResponse(500)).impl })
    expect(c).toMatchObject({ state: 'not-deployed', label: '未部署(500)' })

    const d = await probeAiConfig({
      baseUrl: 'https://ai.example.com',
      fetchImpl: fakeFetch(async () => {
        throw new Error('offline')
      }).impl,
    })
    expect(d).toMatchObject({ state: 'not-deployed', label: '未部署（本地开发模式）' })
  })

  it('空包只打配置探针：URL 正确且 body 为 {}（不消耗大模型调用）', async () => {
    const { impl, calls } = fakeFetch(async () => fakeResponse(400))
    await probeAiConfig({ baseUrl: 'https://ai.example.com/', fetchImpl: impl })
    expect(calls).toEqual([{ url: 'https://ai.example.com/api/ai-organize', body: '{}' }])
  })
})

describe('aiProbe: testAiConnectivity 主动测试', () => {
  it('未填基地址 → 直接判不可用（不发网）', async () => {
    const { impl, calls } = fakeFetch(async () => fakeResponse(200, { ok: true }))
    const outcome = await testAiConnectivity({ baseUrl: '', fetchImpl: impl })
    expect(outcome.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('成功 → 可用（通道，耗时）', async () => {
    const clock = { ms: 0 }
    const { impl, calls } = fakeFetch(async () => {
      clock.ms = 1200
      return fakeResponse(200, { ok: true, provider: 'deepseek' })
    })
    const outcome = await testAiConnectivity({
      baseUrl: 'https://ai.example.com',
      fetchImpl: impl,
      now: () => clock.ms,
    })
    expect(outcome).toEqual({ ok: true, label: '可用（deepseek，1.2s）' })
    // 真调一次模型：body 带固定样例，URL 与业务整理同一端点。
    expect(calls[0].url).toBe('https://ai.example.com/api/ai-organize')
    expect(JSON.parse(calls[0].body)).toEqual(AI_PROBE_PAYLOAD)
  })

  it('缺 provider 时回落「大模型」文案', async () => {
    const { impl } = fakeFetch(async () => fakeResponse(200, { ok: true }))
    const outcome = await testAiConnectivity({ baseUrl: 'https://ai.example.com', fetchImpl: impl, now: () => 0 })
    expect(outcome.label).toBe('可用（大模型，0.0s）')
  })

  it('501 → 未配置', async () => {
    const { impl } = fakeFetch(async () => fakeResponse(501))
    const outcome = await testAiConnectivity({ baseUrl: 'https://ai.example.com', fetchImpl: impl })
    expect(outcome).toEqual({ ok: false, label: '未配置' })
  })

  it('服务端报错 → 取 error 原文（截断 60 字）', async () => {
    const { impl } = fakeFetch(async () => fakeResponse(502, { ok: false, error: 'upstream busy' }))
    const outcome = await testAiConnectivity({ baseUrl: 'https://ai.example.com', fetchImpl: impl })
    expect(outcome).toEqual({ ok: false, label: '不可用：upstream busy' })
  })

  it('超时（AbortError）→ 按秒数报超时', async () => {
    const { impl } = fakeFetch(async () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    })
    const outcome = await testAiConnectivity({ baseUrl: 'https://ai.example.com', fetchImpl: impl, timeoutMs: 15000 })
    expect(outcome).toEqual({ ok: false, label: '不可用：15秒超时' })
  })

  it('其它网络异常 → 带错误信息', async () => {
    const { impl } = fakeFetch(async () => {
      throw new Error('network down')
    })
    const outcome = await testAiConnectivity({ baseUrl: 'https://ai.example.com', fetchImpl: impl })
    expect(outcome).toEqual({ ok: false, label: '不可用：network down' })
  })
})
