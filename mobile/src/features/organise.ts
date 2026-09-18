// AI 整理占位（TASK-DEV-09，AI Confirm 页；对应 SDD US006 超时降级）。
//
// 现状：现役 Web 有 `/api/ai-organize`，但移动端 V1 本 Task 明确**禁网络调用**，
// 且 Android 尚未持有 AI 通道配置，因此这里提供可替换的 `Organiser` 端口 +
// 纯本地占位实现（`localHeuristics`），并用超时包装：
//   - 正常：返回建议（rating/budget/summary/matchedTags），UI 全部可改后再保存；
//   - 超时/异常：返回 timeout/skipped，UI 直接跳过 AI 走手工保存，不阻断记录。
// 未来接入真模型时只需替换 `Organiser` 实现，UI 与超时语义不变。

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
 * 执行 AI 整理（占位）：无文字 → skipped；超时/异常 → timeout/skipped，
 * 由 UI 走「跳过并手工保存」。
 */
export async function runOrganise(
  input: OrganiseInput,
  opts?: { organiser?: Organiser; timeoutMs?: number },
): Promise<OrganiseResult> {
  if (!(input.transcript ?? '').trim()) return { status: 'skipped', reason: 'empty' }
  const timeoutMs = opts?.timeoutMs ?? 8000
  const organiser = opts?.organiser ?? createPlaceholderOrganiser()
  try {
    const suggestion = await withTimeout(organiser.organise(input), timeoutMs)
    return { status: 'ok', suggestion }
  } catch (error) {
    if (error instanceof OrganiseTimeoutError) return { status: 'timeout' }
    return { status: 'skipped', reason: 'error' }
  }
}
