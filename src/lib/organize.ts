// 客户端 AI 适配：优先调用服务端 /api/*（密钥只存在服务端）；
// 服务端未配置或失败时，降级为「本地推测」并明确标注，用户始终在确认页手动修正。
import type { AiOrganizeResult } from './types'

export interface OrganizeInput {
  transcript: string
  placeName?: string
  area?: string
  tags: { id: string; name: string; dimension: string }[]
}

// 封面文字识别：把封面图缩到 1600 以内走 /api/ocr（vision 大模型，不调腾讯）。
// 返回按置信度排序的候选文本（已去空格、≥2字），调用方负责匹配老地点/填新地点。
export async function recognizeCoverText(blob?: Blob): Promise<{ ok: true; texts: string[] } | { ok: false; reason: 'not_configured' | 'error'; message?: string }> {
  if (!blob) return { ok: false, reason: 'error', message: '请先添加照片' }
  try {
    const dataUrl = await new Promise<string>((res, rej) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        try {
          const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(img.naturalWidth * scale))
          c.height = Math.max(1, Math.round(img.naturalHeight * scale))
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
          res(c.toDataURL('image/jpeg', 0.85))
        } catch (e) { rej(e) } finally { URL.revokeObjectURL(url) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片读取失败')) }
      img.src = url
    })
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 15000)
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
        signal: ac.signal,
      })
      if ((r.headers.get('content-type') ?? '').includes('text/html') || r.status === 404) return { ok: false, reason: 'not_configured' }
      const j = await r.json().catch(() => ({}))
      if (r.status === 501 || r.status === 404) return { ok: false, reason: 'not_configured' }
      if (!r.ok || !j.ok) return { ok: false, reason: 'error', message: j.error || `识别失败(${r.status})` }
      return { ok: true, texts: Array.isArray(j.texts) ? j.texts.map(String).slice(0, 8) : [] }
    } finally {
      clearTimeout(timer)
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, reason: 'error', message: '识别超时(15秒)' }
    return { ok: false, reason: 'error', message: e?.message || '识别失败' }
  }
}

export async function organize(input: OrganizeInput): Promise<{ ok: true; result: AiOrganizeResult; mock: boolean } | { ok: false; reason: 'not_configured' | 'error'; message?: string }> {
  // 12s 超时：大模型免费档偶发 60s+ 慢响应，与其让用户干等「整理中…」，
  // 不如快速降级到本地推测（确认页会明确标注，全部可手动修改）
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch('/api/ai-organize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
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
  result.summary = t.slice(0, 40)
  return result
}
