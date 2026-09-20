// 客户端 AI 适配：优先调用服务端 /api/*（密钥只存在服务端）；
// 服务端未配置或失败时，降级为「本地推测」并明确标注，用户始终在确认页手动修正。
import type { AiOrganizeResult } from './types'
import { loadModelOverrides, type AiModelOverrides, type AiProviderId } from './aiSettings'

export interface OrganizeInput {
  transcript: string
  placeName?: string
  area?: string
  tags: { id: string; name: string; dimension: string }[]
}

/** 设置页连通性测试用的固定小段文本（不入库，只验通道）。 */
export const AI_PROBE_TEXT = '连通性测试：今天去了海边咖啡馆，人均45，很放松'

export interface AiProviderTest {
  provider: AiProviderId
  ok: boolean
  ms: number
  model?: string
  message?: string
}

export async function organize(input: OrganizeInput, opts?: { modelOverrides?: AiModelOverrides }): Promise<{ ok: true; result: AiOrganizeResult; mock: boolean } | { ok: false; reason: 'not_configured' | 'error'; message?: string }> {
  // 模型名取自设置页（localStorage），只发模型名，Key 仍只在服务端
  const modelOverrides = opts?.modelOverrides ?? loadModelOverrides()
  // 12s 超时：大模型免费档偶发 60s+ 慢响应，与其让用户干等「整理中…」，
  // 不如快速降级到本地推测（确认页会明确标注，全部可手动修改）
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch('/api/ai-organize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, ...(Object.keys(modelOverrides).length ? { modelOverrides } : {}) }),
      signal: ac.signal,
    })
    if ((r.headers.get('content-type') ?? '').includes('text/html') || r.status === 404) return { ok: false, reason: 'not_configured' }
    const j = await r.json().catch(() => ({}))
    if (r.status === 501 || r.status === 404) return { ok: false, reason: 'not_configured' }
    if (!r.ok || !j.ok) return { ok: false, reason: 'error', message: j.error || `AI 整理失败(${r.status})` }
    return { ok: true, result: j.result as AiOrganizeResult, mock: false }
  } catch (e: any) {
    if (ac.signal.aborted) return { ok: false, reason: 'error', message: 'AI 响应超时(12秒)' }
    return { ok: false, reason: 'error', message: e?.message || 'AI 整理失败' }
  } finally {
    clearTimeout(timer)
  }
}

// ---- 设置页连通性测试：逐家真调一次，报 ok/失败与耗时（结果不入库）----
export async function testAiProvider(
  provider: AiProviderId,
  opts?: { modelOverrides?: AiModelOverrides; timeoutMs?: number },
): Promise<AiProviderTest> {
  const modelOverrides = opts?.modelOverrides ?? loadModelOverrides()
  const timeoutMs = opts?.timeoutMs ?? 15000
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch('/api/ai-organize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: AI_PROBE_TEXT,
        placeName: '测试',
        tags: [],
        providers: [provider], // 只测这一家：服务端按名单过滤降级链
        ...(Object.keys(modelOverrides).length ? { modelOverrides } : {}),
      }),
      signal: ac.signal,
    })
    if ((r.headers.get('content-type') ?? '').includes('text/html') || r.status === 404) {
      return { provider, ok: false, ms: Date.now() - t0, message: '未部署（本地开发模式）' }
    }
    const j = await r.json().catch(() => ({} as Record<string, unknown>))
    const ms = Date.now() - t0
    if (r.ok && j.ok) return { provider, ok: true, ms, model: typeof j.model === 'string' ? j.model : undefined }
    if (r.status === 501) return { provider, ok: false, ms, message: '未配置（服务端无此通道 Key）' }
    return { provider, ok: false, ms, message: String(j.error || `HTTP ${r.status}`).slice(0, 80) }
  } catch (e: any) {
    if (ac.signal.aborted) return { provider, ok: false, ms: Date.now() - t0, message: `超时（${Math.round(timeoutMs / 1000)}秒）` }
    return { provider, ok: false, ms: Date.now() - t0, message: e?.message || '网络失败' }
  } finally {
    clearTimeout(timer)
  }
}

// ---- 未配置时的本地推测（明确标注，仅供参考，全部可改）----
const CN_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
export function cnToNumber(s: string): number | undefined {
  const t = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248))
  if (/^\d+$/.test(t)) return Number(t)
  if (t.includes('百')) {
    const [h, rest] = t.split('百')
    const hundreds = (CN_DIGIT[h] ?? 0) * 100
    return hundreds + (rest ? (cnToNumber(rest) ?? 0) : 0)
  }
  if (t.includes('十')) {
    const [tens, ones] = t.split('十')
    return (tens ? CN_DIGIT[tens] ?? 1 : 1) * 10 + (ones ? CN_DIGIT[ones] ?? 0 : 0)
  }
  if (t.length === 1 && CN_DIGIT[t] != null) return CN_DIGIT[t]
  return undefined
}

export function localHeuristics(input: OrganizeInput): AiOrganizeResult {
  const t = input.transcript || ''
  const result: AiOrganizeResult = { matched_tags: [], unmatched_suggestions: [], confidence: 0.2 }
  const budget = t.match(/(?:人均|预算|消费|花了?)\s*([0-9０-９一二三四五六七八九十百]+)/)
  if (budget) result.budget = cnToNumber(budget[1])
  const star = t.match(/(?:给|打|评)?\s*([0-9０-９一二三四五六七八九])\s*星/)
  if (star) result.score = Math.min(5, Math.max(1, cnToNumber(star[1]) ?? 0))
  for (const tag of input.tags) {
    if (tag.name.length >= 2 && t.includes(tag.name)) result.matched_tags!.push(tag.name)
  }
  // 无 AI 时不做清洗：cleaned_transcript 原样回填原文；public_reason 留空，由用户在确认页手填兜底
  result.cleaned_transcript = t
  result.public_reason = ''
  return result
}
