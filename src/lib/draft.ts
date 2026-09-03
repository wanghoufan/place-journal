// 记录草稿的内存传递（Record → AiConfirm 同一 SPA 会话）。
// 不走 sessionStorage：Blob 无法序列化，且刷新丢失草稿是合理语义。
import type { RecordDraft } from './types'

let current: RecordDraft | null = null

export function setDraft(d: RecordDraft) { current = d }
export function takeDraft(): RecordDraft | null {
  const d = current
  return d
}
export function clearDraft() { current = null }
