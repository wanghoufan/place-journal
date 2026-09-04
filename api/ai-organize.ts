// AI 结构化整理：可切换 Provider（OpenRouter / DeepSeek / OpenCode），固定 JSON 合同。
// 未配置任何 Key 时返回 501 {ok:false}，客户端降级为本地推测 + 手动确认。
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface ChatMsg { role: 'system' | 'user'; content: string }

function providers(): { name: string; url: string; key: string; model: string }[] {
  const order = (process.env.AI_PROVIDER_ORDER || 'openrouter,deepseek,opencode').split(',').map((s) => s.trim()).filter(Boolean)
  const list: Record<string, { url: string; key?: string; model?: string }> = {
    openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/auto' },
    deepseek: { url: 'https://api.deepseek.com/chat/completions', key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' },
    // OPENCODE_BASE_URL 允许填 base（如 https://opencode.ai/zen/go/v1）或完整端点，统一补齐 /chat/completions
    opencode: { url: (process.env.OPENCODE_BASE_URL || '').replace(/\/+$/, '') + '/chat/completions', key: process.env.OPENCODE_API_KEY, model: process.env.OPENCODE_MODEL || '' },
  }
  return order
    .map((name) => ({ name, ...list[name] }))
    .filter((p) => list[p.name] && p.key && (p.name !== 'opencode' || p.url))
    .map((p) => ({ name: p.name, url: p.url, key: p.key!, model: p.model || '' }))
}

const SYSTEM = `你是私人地点手账的整理助手。根据用户的到访感受描述，输出严格的 JSON（不要 markdown、不要解释）：
{"score":1-5的整数|null,"budget":人均数字(元)|null,"summary":"20字内的一句话摘要","matched_tags":["从候选标签中选中的名称"],"unmatched_suggestions":["描述里出现但候选标签中没有的关键词，最多3个"],"confidence":0-1}
规则：只能从候选标签中选；不确定就填 null；不要创造候选以外的标签（unmatched 只作建议）。`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' })
  const ps = providers()
  if (!ps.length) return res.status(501).json({ ok: false, reason: 'not_configured' })

  const { transcript, placeName, area, tags } = req.body ?? {}
  if (!transcript) return res.status(400).json({ ok: false, error: 'transcript required' })

  const user = [
    placeName ? `地点：${placeName}${area ? '（' + area + '）' : ''}` : '',
    `感受：${transcript}`,
    `候选标签：${(tags ?? []).map((t: any) => `${t.dimension}:${t.name}`).join('、') || '无'}`,
  ].filter(Boolean).join('\n')

  const messages: ChatMsg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }]

  // OBS-V2（真机QA Vercel 2026-09-04）：上游无单次超时，偶发慢撞 Vercel 15s 上限直接 504。
  // 策略：单 provider 最多 9s；全局 13s deadline（留 2s 余量），超时快速 failover 下一个。
  const UPSTREAM_TIMEOUT_MS = 9000
  const DEADLINE_MS = 13000
  const t0 = Date.now()

  let lastErr = ''
  for (const p of ps) {
    const remain = DEADLINE_MS - (Date.now() - t0)
    if (remain < 1000) { lastErr = `${lastErr ? lastErr + '; ' : ''}deadline reached`; break }
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), Math.min(UPSTREAM_TIMEOUT_MS, remain))
    try {
      const r = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
        signal: ctl.signal,
      })
      if (!r.ok) { lastErr = `${p.name} HTTP ${r.status}`; continue }
      const j = await r.json()
      const text: string = j?.choices?.[0]?.message?.content ?? ''
      const jsonText = text.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim()
      const parsed = JSON.parse(jsonText)
      const result = {
        score: typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : undefined,
        budget: typeof parsed.budget === 'number' ? parsed.budget : undefined,
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
        matched_tags: Array.isArray(parsed.matched_tags) ? parsed.matched_tags.slice(0, 8).map(String) : [],
        unmatched_suggestions: Array.isArray(parsed.unmatched_suggestions) ? parsed.unmatched_suggestions.slice(0, 3).map(String) : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
      }
      return res.status(200).json({ ok: true, result, provider: p.name })
    } catch (e: any) {
      lastErr = `${p.name}: ${e?.name === 'AbortError' ? 'timeout' : e?.message || 'failed'}`
    } finally {
      clearTimeout(timer)
    }
  }
  return res.status(502).json({ ok: false, error: lastErr || 'all providers failed' })
}
