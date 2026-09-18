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
