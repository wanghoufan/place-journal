// 封面文字识别（vision 大模型版，不调腾讯）：
// 按 OpenCode → OpenRouter → DeepSeek 逐个试 OpenAI 兼容的 vision 接口，
// 不支持看图的模型会快速报错并自动 failover 下一个。
// 与前端的契约不变：{ok:true, texts:[...]} / {ok:false}，
// 任一通道成功即返回；全部失败才报错（附各通道原因，方便换 vision 模型）。
// 未配置任何 Key 时返回 501 {ok:false}，客户端降级为手动输入。
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

function providers(): { name: string; url: string; key: string; model: string }[] {
  // OpenCode 优先（用户指定）；其余复用 ai-organize 同一套 Key/模型变量，不新增环境变量
  const list: Record<string, { url: string; key?: string; model?: string }> = {
    opencode: { url: (process.env.OPENCODE_BASE_URL || '').replace(/\/+$/, '') + '/chat/completions', key: process.env.OPENCODE_API_KEY, model: process.env.OPENCODE_MODEL || '' },
    openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/auto' },
    deepseek: { url: 'https://api.deepseek.com/chat/completions', key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' },
  }
  return ['opencode', 'openrouter', 'deepseek']
    .map((name) => ({ name, ...list[name] }))
    .filter((p) => p.key && (p.name !== 'opencode' || p.url.replace(/\/chat\/completions$/, '')))
    .map((p) => ({ name: p.name, url: p.url, key: p.key!, model: p.model || '' }))
}

const SYSTEM = `你是门头招牌文字识别助手。只输出严格的 JSON（不要 markdown、不要解释）：
{"texts":["按字号从大到小、从上到下排列的印刷文字，最多8个"]}
规则：只收录招牌/店名/标语类印刷中文、英文、数字；每个≥2字、去掉空格；虚的、反光看不清的不收；无文字就返回 {"texts":[]}。`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' })
  const ps = providers()
  if (!ps.length) return res.status(501).json({ ok: false, reason: 'not_configured' })

  // 自托管 server.mjs 会预挂 req.body；Vercel 预解析 JSON。若都没有，兜底读流。
  let body: any = (req as any).body
  if (!body || typeof body === 'string' || Buffer.isBuffer((req as any).body)) {
    try {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch { body = {} }
  }
  let image: string = typeof body?.image === 'string' ? body.image : ''
  if (!image) return res.status(400).json({ ok: false, error: 'image required' })
  if (!image.startsWith('data:image/')) image = `data:image/jpeg;base64,${image.replace(/^data:image\/\w+;base64,/, '')}`

  // Vercel 15s 上限：单通道 6s，全局 13s（留 2s 余量），超时快速 failover 下一个
  const UPSTREAM_TIMEOUT_MS = 6000
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
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [
                { type: 'text', text: '识别这张门头照片上的文字，输出 JSON。' },
                { type: 'image_url', image_url: { url: image } },
              ],
            },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        signal: ctl.signal,
      })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        lastErr = `${p.name} HTTP ${r.status}${/image|vision|content|modal/i.test(t) ? '（该模型可能不支持看图）' : ''}`
        continue
      }
      const j: any = await r.json()
      const text: string = j?.choices?.[0]?.message?.content ?? ''
      const parsed = JSON.parse(text.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim())
      const arr = Array.isArray(parsed) ? parsed : parsed.texts
      const texts = (Array.isArray(arr) ? arr : [])
        .map((x: any) => String(x ?? '').replace(/\s+/g, ''))
        .filter((x: string) => x.length >= 2)
        .slice(0, 8)
      return res.status(200).json({ ok: true, texts, provider: p.name })
    } catch (e: any) {
      lastErr = `${p.name}: ${e?.name === 'AbortError' ? 'timeout' : e?.message || 'failed'}`
    } finally {
      clearTimeout(timer)
    }
  }
  return res.status(502).json({
    ok: false,
    error: lastErr
      ? `三个 AI 通道都认不出（${lastErr}）。如提示“不支持看图”，请换一个 vision 模型（如 OpenRouter 的图文模型）后重试。`
      : 'all providers failed',
  })
}
