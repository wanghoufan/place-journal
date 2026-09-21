// AI 连通性探针（对标 Web `src/pages/Mine.tsx` 的 AiStatus）：
//   - 被动探针 `probeAiConfig`：空包 POST，只看 Key 配没配（400=已配置 / 501=未配置），
//     不消耗大模型调用；
//   - 主动测试 `testAiConnectivity`：实打实调一次模型，报通道名 + 耗时。
// 两者都注入 fetchImpl / now，便于单测；基地址复用 `organise.ts` 的 `aiApiBase()`。

import { aiApiBase } from './organise'

export type AiConfigState = 'configured' | 'unconfigured' | 'missing-base' | 'not-deployed'

export interface AiConfigProbe {
  state: AiConfigState
  label: string
}

const CONFIG_LABEL: Record<AiConfigState, string> = {
  configured: '已配置',
  unconfigured: '未配置',
  'missing-base': '未配置（未填 EXPO_PUBLIC_AI_API_BASE）',
  'not-deployed': '未部署（本地开发模式）',
}

/** 探针用基地址：显式传入优先，否则读打包内联的 `EXPO_PUBLIC_AI_API_BASE`。 */
function resolveBase(explicit?: string): string {
  return (explicit ?? aiApiBase()).trim().replace(/\/+$/, '')
}

/** 主动测试用的固定样例（不读用户数据，不落库）。 */
export const AI_PROBE_PAYLOAD = {
  transcript: '连通性测试：今天去了海边咖啡馆，人均45，很放松',
  placeName: '测试',
  tags: [],
} as const

export const AI_PROBE_TIMEOUT_MS = 15000

export async function probeAiConfig(opts?: {
  baseUrl?: string
  fetchImpl?: typeof fetch
}): Promise<AiConfigProbe> {
  const base = resolveBase(opts?.baseUrl)
  if (!base) return { state: 'missing-base', label: CONFIG_LABEL['missing-base'] }
  const doFetch = opts?.fetchImpl ?? fetch
  try {
    const response = await doFetch(`${base}/api/ai-organize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (response.status === 501) return { state: 'unconfigured', label: CONFIG_LABEL.unconfigured }
    if (response.status === 400) return { state: 'configured', label: CONFIG_LABEL.configured }
    return { state: 'not-deployed', label: `未部署(${response.status})` }
  } catch {
    return { state: 'not-deployed', label: CONFIG_LABEL['not-deployed'] }
  }
}

export interface AiTestOutcome {
  ok: boolean
  label: string
}

/** 主动连通性测试：成功报「可用（通道，Xs）」，其余一律给出可读原因。 */
export async function testAiConnectivity(opts?: {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => number
}): Promise<AiTestOutcome> {
  const base = resolveBase(opts?.baseUrl)
  if (!base) return { ok: false, label: CONFIG_LABEL['missing-base'] }
  const doFetch = opts?.fetchImpl ?? fetch
  const now = opts?.now ?? (() => Date.now())
  const timeoutMs = opts?.timeoutMs ?? AI_PROBE_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = now()
  try {
    const response = await doFetch(`${base}/api/ai-organize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(AI_PROBE_PAYLOAD),
      signal: controller.signal,
    })
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; provider?: string; error?: string }
    if (response.ok && payload.ok) {
      const seconds = ((now() - startedAt) / 1000).toFixed(1)
      return { ok: true, label: `可用（${payload.provider ?? '大模型'}，${seconds}s）` }
    }
    if (response.status === 501) return { ok: false, label: CONFIG_LABEL.unconfigured }
    return { ok: false, label: `不可用：${String(payload.error || `HTTP ${response.status}`).slice(0, 60)}` }
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    if (name === 'AbortError') return { ok: false, label: `不可用：${timeoutMs / 1000}秒超时` }
    const message = error instanceof Error ? error.message : '网络失败'
    return { ok: false, label: `不可用：${message}` }
  } finally {
    clearTimeout(timer)
  }
}
