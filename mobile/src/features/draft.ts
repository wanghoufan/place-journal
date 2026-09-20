// 记录草稿的内存接力（Record → AiConfirm，同一 App 会话），对标 Web `src/lib/draft.ts`。
//
// 只走内存、不落库：照片是本地文件 URI，无需序列化；进程被杀后草稿丢失是合理语义——
// AiConfirm 取不到草稿时回退到独立输入表单，绝不阻断手工保存。

import type { PickedAsset } from '../media/picker'

export interface RecordDraft {
  /** 已选照片（顺序即入库存档顺序，第一张为封面）。 */
  assets: PickedAsset[]
  /** 复用既有地点。 */
  placeId?: string
  /** 或新建地点。 */
  newPlace?: { name: string; area?: string }
  visitDate: string
  rating?: number
  budget?: number
  /** 私密感受（仅自己可见）。 */
  notePrivate?: string
  /** 公开分享理由（分享时展示，可空）。 */
  notePublic?: string
  /** 仅叶子标签。 */
  tagIds: string[]
}

let current: RecordDraft | null = null
let saved = false

export function setDraft(draft: RecordDraft): void {
  current = draft
  saved = false
}

/** 读取草稿（不清空；确认保存/放弃时再 clearDraft，避免重渲染丢草稿）。 */
export function takeDraft(): RecordDraft | null {
  return current
}

export function clearDraft(): void {
  current = null
}

/**
 * 确认页保存成功时置位。记录页在 tab 里常驻（不像 Web 会卸载），保存后表单还在，
 * 回到记录页再点一次保存就会建出第二条记录；记录页据本信号复位一次表单。
 */
export function markDraftSaved(): void {
  saved = true
}

/** 消费一次「草稿已保存」信号（读后即清，避免重复复位）。 */
export function consumeDraftSaved(): boolean {
  const value = saved
  saved = false
  return value
}
