// 表单校验与标签选择纯函数（TASK-DEV-09），供 Record / Entry 编辑 / AI Confirm 共用。

import type { TagGroup, TagWithUsage } from './queries'

export interface RecordFormValues {
  placeId?: string
  newPlaceName?: string
  visitDate: string
  notePrivate?: string
  notePublic?: string
  tagIds: string[]
}

/** 记录保存前置校验：必须确定地点 + 日期。返回错误文案或 null。 */
export function validateRecordForm(values: RecordFormValues): string | null {
  const hasPlace = !!values.placeId || !!(values.newPlaceName ?? '').trim()
  if (!hasPlace) return '请选择或填写地点'
  if (!(values.visitDate ?? '').trim()) return '请选择到访日期'
  return null
}

/**
 * 「交给 AI 整理」按钮三态（对标 Web `src/pages/Record.tsx` 的 hasPlace/hasContent/canNext）：
 * 门槛写进按钮文案本身，用户点不动时当场就能看到原因，不必靠页面顶部那行提示
 * （记录页很长，顶部提示在按钮处根本看不见，表现为「点了没反应」）。
 *
 * 内容口径与 Web 逐字一致：私密感受 / 公开理由 / 照片，任一有值即算有内容
 * —— 只填「公开分享理由」也必须能进整理页，漏掉它就会静默拦截。
 */
export function aiNextGate(values: {
  placeId?: string
  newPlaceName?: string
  notePrivate?: string
  notePublic?: string
  photoCount: number
}): { hasPlace: boolean; hasContent: boolean; canNext: boolean; label: string } {
  const hasPlace = !!values.placeId || !!(values.newPlaceName ?? '').trim()
  const hasContent =
    !!(values.notePrivate ?? '').trim() || !!(values.notePublic ?? '').trim() || values.photoCount > 0
  return {
    hasPlace,
    hasContent,
    canNext: hasPlace && hasContent,
    label: !hasPlace ? '先选择地点，再交给 AI 整理 →' : !hasContent ? '添加照片或写写感受' : '交给 AI 整理 →',
  }
}

/** 勾选/取消一个标签 id（保持原顺序，新值追加尾部）。 */
export function toggleTagId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

/** 可勾选标签 = 叶子标签（有子标签的是分组容器）。 */
export function leafTags(groups: TagGroup[]): TagWithUsage[] {
  const parents = new Set<string>()
  for (const group of groups) {
    for (const tag of group.tags) {
      if (tag.parentId) parents.add(tag.parentId)
    }
  }
  return groups.flatMap((group) => group.tags.filter((tag) => !parents.has(tag.id)))
}

/** 全部标签（含父标签），供 Tags 页展示。 */
export function allTags(groups: TagGroup[]): TagWithUsage[] {
  return groups.flatMap((group) => group.tags)
}

/** 标签分组默认折叠态：无使用记录的标签仍展示，但排序把常用的放前。 */
export function sortTagsByUsage(tags: TagWithUsage[]): TagWithUsage[] {
  return [...tags].sort((a, b) => b.usage - a.usage || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}
