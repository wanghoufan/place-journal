// AI 整理（TASK-DEV-09 建端口；TASK-PWA-AI-01 接真网）。
//
// 端口不变：`Organiser` 抽象 + 超时包装（runOrganise）。当前提供两种实现：
//   - `createPlaceholderOrganiser`：纯本地启发式（离线/未配置时用，mock=true）；
//   - `createHttpOrganiser`：调同一服务端 `/api/ai-organize`（与 Web 共用），
//     任何失败/超时/未配置都回退本地占位，绝不阻断保存。
// 走哪条由 `createDefaultOrganiser` 决定：配了 `EXPO_PUBLIC_AI_API_BASE` 走真网，否则保持占位。

export interface OrganiseTagOption {
  id: string
  name: string
  dimension?: string
}

export interface OrganiseInput {
  transcript?: string
  placeName?: string
  area?: string
  tags: OrganiseTagOption[]
}

export interface OrganiseSuggestion {
  rating?: number
  budget?: number
  summary: string
  /** AI 清洗后的感受（去口水词、补标点，原意不动）；无 AI 时原样回填用户原文。 */
  cleanedTranscript: string
  /** AI 按感受总结的公开分享理由；无 AI 时为空串（UI 用用户自填兜底）。 */
  publicReason: string
  /** 命中的既有标签 id（AI 不得自动建标签）。 */
  matchedTags: string[]
  /** 未匹配到既有标签的建议名（仅供用户手动决定）。 */
  unmatched: string[]
  /** 是否本地占位结果（非真模型）。 */
  mock: boolean
}

export interface Organiser {
  organise(input: OrganiseInput): Promise<OrganiseSuggestion>
}

export type OrganiseResult =
  | { status: 'ok'; suggestion: OrganiseSuggestion }
  | { status: 'timeout' }
  | { status: 'skipped'; reason: 'empty' | 'error' }

export class OrganiseTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI 整理超时（${timeoutMs}ms）`)
    this.name = 'OrganiseTimeoutError'
  }
}

const POSITIVE = ['喜欢', '超赞', '完美', '惊艳', '舒服', '好吃', '推荐', '漂亮', '安静']
const NEUTRAL = ['一般', '还行', '普通', '凑合']
const NEGATIVE = ['失望', '难吃', '吵', '不好', '踩雷']

function extractBudget(text: string): number | undefined {
  const explicit = /(?:人均|预算|花了|约)\s*[¥￥]?\s*(\d{1,4})/.exec(text)
  if (explicit) return Number(explicit[1])
  const yuan = /(\d{1,4})\s*(?:元|块|¥|￥)/.exec(text)
  if (yuan) return Number(yuan[1])
  return undefined
}

function inferRating(text: string): number | undefined {
  if (NEGATIVE.some((w) => text.includes(w))) return 2
  if (NEUTRAL.some((w) => text.includes(w))) return 3
  if (POSITIVE.some((w) => text.includes(w))) return 5
  return undefined
}

function firstSentence(text: string): string {
  const match = /[^。！？!?\n]+/.exec(text.trim())
  return (match?.[0] ?? text).trim()
}

/** 纯本地启发式：确定性、无副作用，便于单测与离线降级。 */
export function localHeuristics(input: OrganiseInput): OrganiseSuggestion {
  const transcript = (input.transcript ?? '').trim()
  const matched: string[] = []
  const unmatched: string[] = []
  for (const tag of input.tags) {
    if (tag.name && transcript.includes(tag.name)) matched.push(tag.id)
  }
  const summary = transcript
    ? firstSentence(transcript).slice(0, 30)
    : input.placeName
      ? `${input.placeName}${input.area ? ' · ' + input.area : ''}`
      : ''
  return {
    rating: transcript ? inferRating(transcript) : undefined,
    budget: transcript ? extractBudget(transcript) : undefined,
    summary,
    // 无 AI 时不做清洗（对标 Web localHeuristics）：感受原样回填，理由留空由用户手填兜底。
    cleanedTranscript: transcript,
    publicReason: '',
    matchedTags: matched,
    unmatched,
    mock: true,
  }
}

/** 占位 Organiser：可选延迟后返回本地启发式结果（用于演示/超时路径）。 */
export function createPlaceholderOrganiser(delayMs = 0): Organiser {
  return {
    async organise(input) {
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
      }
      return localHeuristics(input)
    },
  }
}

// ---- 真网 Organiser（TASK-PWA-AI-01）----

/** 服务端 AI 整理的超时；与 Web 侧一致取 12s（`src/lib/organize.ts` 同值）。
 *  不能短于服务端自身的 failover 预算：服务端单通道 9s、全局 deadline 13s，
 *  客户端若 8s 就掐断，就等于永远拿不到慢通道的结果，只能吃本地推测。 */
export const AI_API_TIMEOUT_MS = 12000

/** 服务端基地址：`mobile/.env` 的 EXPO_PUBLIC_AI_API_BASE（需静态读取才能被 Expo 内联）。 */
export function aiApiBase(): string {
  return (process.env.EXPO_PUBLIC_AI_API_BASE ?? '').trim().replace(/\/+$/, '')
}

/** 服务端 `/api/ai-organize` 返回的 result 字段（与 Web 同一合同）。 */
interface ServerAiResult {
  score?: number
  budget?: number
  cleaned_transcript?: string
  public_reason?: string
  matched_tags?: string[]
  unmatched_suggestions?: string[]
}

function toSuggestion(raw: ServerAiResult, input: OrganiseInput): OrganiseSuggestion {
  const idByName = new Map(input.tags.map((t) => [t.name, t.id]))
  // 服务端给的是标签「名字」，本端只认既有标签 id：命不中的名字一律丢弃，AI 不得自动建标签
  const matchedTags = (Array.isArray(raw.matched_tags) ? raw.matched_tags : [])
    .map((name) => idByName.get(String(name)))
    .filter((id): id is string => !!id)
  const text = raw.public_reason || raw.cleaned_transcript || ''
  return {
    rating: typeof raw.score === 'number' ? raw.score : undefined,
    budget: typeof raw.budget === 'number' ? raw.budget : undefined,
    summary: text ? firstSentence(text).slice(0, 60) : '',
    // 感受与公开理由分两路（对标 Web AiConfirm）：清洗版进「整理后感受」，理由进「公开分享理由」。
    cleanedTranscript: (raw.cleaned_transcript ?? '').trim(),
    publicReason: (raw.public_reason ?? '').trim(),
    matchedTags,
    unmatched: (Array.isArray(raw.unmatched_suggestions) ? raw.unmatched_suggestions : [])
      .map(String)
      .filter((name) => !idByName.has(name)),
    mock: false,
  }
}

/**
 * 真网 Organiser：调服务端 `/api/ai-organize`（Key 只在服务端，本端不带任何密钥）。
 * 501 / 网络失败 / 超时 / 返回体异常 → 回退 `localHeuristics`（mock=true），绝不抛出。
 */
export function createHttpOrganiser(opts?: {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Organiser {
  const baseUrl = (opts?.baseUrl ?? aiApiBase()).trim().replace(/\/+$/, '')
  const timeoutMs = opts?.timeoutMs ?? AI_API_TIMEOUT_MS
  const doFetch = opts?.fetchImpl ?? fetch
  return {
    async organise(input) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await doFetch(`${baseUrl}/api/ai-organize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: input.transcript,
            placeName: input.placeName,
            area: input.area,
            tags: input.tags.map((t) => ({ name: t.name, dimension: t.dimension ?? '' })),
          }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = (await response.json()) as { ok?: boolean; result?: ServerAiResult }
        if (!payload?.ok || !payload.result) throw new Error('bad payload')
        return toSuggestion(payload.result, input)
      } catch {
        return localHeuristics(input)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** 默认整理器：配了服务端基地址走真网，否则保持本地占位（缺省不发网）。 */
export function createDefaultOrganiser(): Organiser {
  return aiApiBase() ? createHttpOrganiser() : createPlaceholderOrganiser()
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OrganiseTimeoutError(timeoutMs)), timeoutMs)
    }),
  ])
}

/**
 * 执行 AI 整理：无文字 → skipped；超时/异常 → timeout/skipped，
 * 由 UI 走「跳过并手工保存」。默认整理器见 `createDefaultOrganiser`
 * （未配 `EXPO_PUBLIC_AI_API_BASE` 时就是本地占位，行为与旧版一致）。
 */
export async function runOrganise(
  input: OrganiseInput,
  opts?: { organiser?: Organiser; timeoutMs?: number },
): Promise<OrganiseResult> {
  if (!(input.transcript ?? '').trim()) return { status: 'skipped', reason: 'empty' }
  const timeoutMs = opts?.timeoutMs ?? AI_API_TIMEOUT_MS
  const organiser = opts?.organiser ?? createDefaultOrganiser()
  try {
    const suggestion = await withTimeout(organiser.organise(input), timeoutMs)
    return { status: 'ok', suggestion }
  } catch (error) {
    if (error instanceof OrganiseTimeoutError) return { status: 'timeout' }
    return { status: 'skipped', reason: 'error' }
  }
}
