// AI 模型配置（TASK-PWA-AI-01）：三家 provider 的「模型名」存在本机 localStorage。
// 只存模型名，绝不存 Key —— Key 只在服务端环境变量，前端只负责按名挑模型。

export interface AiModelOverrides {
  openrouter?: string
  deepseek?: string
  opencode?: string
}

export type AiProviderId = keyof AiModelOverrides

export const AI_PROVIDERS: AiProviderId[] = ['deepseek', 'openrouter', 'opencode']

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  opencode: 'OpenCode',
}

// 现行可选模型名（2026-09-20 核实）：deepseek 旧默认 deepseek-chat 已于 2026-07-24 退役；
// OpenCode 走 OpenAI 兼容端点、模型名由服务端环境变量与用户自填共同决定，故不给预设。
export const AI_MODEL_PRESETS: Record<AiProviderId, string[]> = {
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  openrouter: ['openrouter/auto'],
  opencode: [],
}

// OpenCode 自填框的占位示例（只是提示文本，不作为默认值写入）
export const AI_MODEL_PLACEHOLDER: Record<AiProviderId, string> = {
  deepseek: 'deepseek-flash',
  openrouter: 'openrouter/auto',
  opencode: '如 glm-5.3-flash（以 OpenCode 后台为准）',
}

export const AI_SETTINGS_KEY = 'ai-model-overrides'

/** 去掉空值与首尾空白；全空时返回空对象（调用方据此决定是否带上 modelOverrides）。 */
export function pruneModelOverrides(input: AiModelOverrides | null | undefined): AiModelOverrides {
  const out: AiModelOverrides = {}
  if (!input) return out
  for (const id of AI_PROVIDERS) {
    const v = input[id]
    if (typeof v === 'string' && v.trim()) out[id] = v.trim().slice(0, 120)
  }
  return out
}

export function loadModelOverrides(): AiModelOverrides {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY)
    if (!raw) return {}
    return pruneModelOverrides(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function saveModelOverrides(input: AiModelOverrides): AiModelOverrides {
  const clean = pruneModelOverrides(input)
  try {
    if (Object.keys(clean).length) localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(clean))
    else localStorage.removeItem(AI_SETTINGS_KEY)
  } catch { /* 隐私模式等写不了就只影响本机记忆，不影响功能 */ }
  return clean
}
