// AI 结构化整理：可切换 Provider（OpenRouter / DeepSeek / OpenCode），固定 JSON 合同。
// 未配置任何 Key 时返回 501 {ok:false}，客户端降级为本地推测 + 手动确认。
import type { VercelRequest, VercelResponse } from '@vercel/node'

interface ChatMsg { role: 'system' | 'user'; content: string }

// 客户端只能覆盖「模型名」；Key 永远只从服务端环境变量读取，绝不接受前端传入（TASK-PWA-AI-01）。
type ModelOverrides = { openrouter?: string; deepseek?: string; opencode?: string }

function cleanModel(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined
}

function providers(overrides: ModelOverrides = {}, only?: unknown): { name: string; url: string; key: string; model: string }[] {
  const order = (process.env.AI_PROVIDER_ORDER || 'openrouter,deepseek,opencode').split(',').map((s) => s.trim()).filter(Boolean)
  const list: Record<string, { url: string; key?: string; model?: string }> = {
    openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/auto' },
    // DeepSeek 旧默认 deepseek-chat 已于 2026-07-24 退役；现行默认 deepseek-flash（V4.1-Flash）
    deepseek: { url: 'https://api.deepseek.com/chat/completions', key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash' },
    // OPENCODE_BASE_URL 允许填 base（如 https://opencode.ai/zen/go/v1）或完整端点，统一补齐 /chat/completions
    opencode: { url: (process.env.OPENCODE_BASE_URL || '').replace(/\/+$/, '') + '/chat/completions', key: process.env.OPENCODE_API_KEY, model: process.env.OPENCODE_MODEL || '' },
  }
  // only：设置页「各通道连通性测试」用，把本轮尝试限制在给定名单内；
  // 名单只做 order 的过滤（不能凭名字凭空启用未配置的通道），且仍要求该通道的 Key 已在服务端配好。
  const named = Array.isArray(only) ? only.filter((n): n is string => typeof n === 'string') : null
  const effective = named && named.length ? order.filter((n) => named.includes(n)) : order
  return effective
    .map((name) => ({ name, ...list[name] }))
    .filter((p) => list[p.name] && p.key && (p.name !== 'opencode' || p.url))
    .map((p) => ({ name: p.name, url: p.url, key: p.key!, model: cleanModel(overrides[p.name as keyof ModelOverrides]) ?? p.model ?? '' }))
}

// 三件套合同（TASK-PWA-01，2026-09-20 用户拍板）：
// cleaned_transcript＝清洗后的感受原文；public_reason＝可直接给朋友看的公开理由；matched_tags＝从感受提取。
// summary 已退役（不再产出），仅保留类型/同步字段做库兼容。
const SYSTEM = `你是私人地点手账的整理助手。用户会给一段到访感受的口述原文（微信语音输入，常有口水词、几乎没有标点）。请整理后输出严格的 JSON（不要 markdown、不要解释）：
{"score":1-5的整数|null,"budget":人均数字(元)|null,"cleaned_transcript":"清洗后的感受全文","public_reason":"给朋友看的公开推荐理由，2-3句","matched_tags":["从候选标签中选中的名称"],"unmatched_suggestions":["描述里出现但候选标签中没有的关键词，最多3个"],"confidence":0-1}
规则：
1) cleaned_transcript：去掉口水词（嗯、啊、哦、就是、然后、那个、反正、你知道吗之类）和重复啰嗦，补标点、顺断句，保留原有分段感觉。只清洗不创作：不增删事实、不改原意、不改第一人称口吻，长度与原文相当。
2) public_reason：写给朋友看的公开推荐理由，2-3 句、不超过 80 字。从 cleaned_transcript 里提炼真提到的亮点（氛围、适合谁、价格、值不值得去），不编造没提到的信息，不写私密内容（私人行程、私人关系、具体住址等）。范文口径：「夜景超美，露台位很适合拍照，晚上八点后人少；咖啡人均 40 左右，聊天待到打烊也不催。」
3) matched_tags：只根据感受原文里真正提到的点，从候选标签中选；感受里没提的不要因为地点名字沾边就选；不确定就不选。
4) unmatched_suggestions：感受里出现、候选标签中没有的关键词，最多 3 个，只作建议。
5) summary 字段已退役，不要输出。
不确定的字段填 null（matched_tags / unmatched_suggestions 填 []）。`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' })

  // body：transcript/placeName/area/tags 为正文；modelOverrides（仅模型名）与 providers（仅测试用名单）可选。
  const { transcript, placeName, area, tags, modelOverrides, providers: onlyProviders } = req.body ?? {}
  const ps = providers((modelOverrides ?? {}) as ModelOverrides, onlyProviders)
  if (!ps.length) return res.status(501).json({ ok: false, reason: 'not_configured' })
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
    // OpenCode Go 要求：自报家门 UA＋每会话稳定的 x-opencode-session（见 https://opencode.ai/docs/go/），否则 400 MissingSessionID。
  const extraHeaders: Record<string, string> =
    p.name === 'opencode' ? { 'User-Agent': 'place-journal/1.0', 'x-opencode-session': 'place-journal-ai' } : {}
  try {
      const r = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}`, ...extraHeaders },
        body: JSON.stringify({ model: p.model, messages, temperature: 0.2, response_format: { type: 'json_object' },
          // DeepSeek V4 默认思考模式（high）慢且贵，结构化整理不需要推理，直接关（官方 thinking.type=disabled）
          ...(p.name === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
        }),
        signal: ctl.signal,
      })
      if (!r.ok) { const t = await r.text().catch(() => ''); lastErr = `${lastErr ? lastErr + '; ' : ''}${p.name} HTTP ${r.status} ${t.slice(0, 200)}`; continue }
      const j = await r.json()
      const text: string = j?.choices?.[0]?.message?.content ?? ''
      const jsonText = text.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim()
      const parsed = JSON.parse(jsonText)
      const result = {
        score: typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : undefined,
        budget: typeof parsed.budget === 'number' ? parsed.budget : undefined,
        // summary 退役：上游若仍回传也丢弃，不再进 result（库字段由类型保留做兼容）
        cleaned_transcript: typeof parsed.cleaned_transcript === 'string' ? parsed.cleaned_transcript.slice(0, 2000) : undefined,
        public_reason: typeof parsed.public_reason === 'string' ? parsed.public_reason.slice(0, 300) : undefined,
        matched_tags: Array.isArray(parsed.matched_tags) ? parsed.matched_tags.slice(0, 8).map(String) : [],
        unmatched_suggestions: Array.isArray(parsed.unmatched_suggestions) ? parsed.unmatched_suggestions.slice(0, 3).map(String) : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
      }
      return res.status(200).json({ ok: true, result, provider: p.name, model: p.model })
    } catch (e: any) {
      lastErr = `${p.name}: ${e?.name === 'AbortError' ? 'timeout' : e?.message || 'failed'}`
    } finally {
      clearTimeout(timer)
    }
  }
  return res.status(502).json({ ok: false, error: lastErr || 'all providers failed' })
}
