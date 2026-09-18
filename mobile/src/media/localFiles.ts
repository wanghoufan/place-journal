// App documents 持久媒体目录与临时 URI 复制（T047/T048；SDD 10.2、FR-027）。
//
// 目录结构（与 SDD 10.2 一致）：
//   App documents/
//     place-journal/
//       media/
//         <entryId>/
//           <mediaId>/
//             source-or-display.jpg   ← display 处理结果
//             thumb.jpg               ← 缩略图
//
// 设计：`mediaTargetPaths` / `joinUri` 为纯函数可单测；`MediaFileSystem` 抽象原生
// expo-file-system，测试可注入内存实现；`createExpoMediaFileSystem` 才碰原生。
// picker/camera 临时 URI 只作输入，复制成功后正式记录只引用持久目录路径（FR-027）。

import { Directory, File, Paths } from 'expo-file-system'

export const MEDIA_ROOT = 'place-journal'
export const MEDIA_SUBDIR = 'media'
export const DISPLAY_FILENAME = 'source-or-display.jpg'
export const THUMB_FILENAME = 'thumb.jpg'

/** 拼接 URI，去掉首尾多余斜杠（不引入 URL 编码）。 */
export function joinUri(base: string, ...segments: string[]): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const parts = segments.map((s) => s.replace(/^\/+/, '').replace(/\/+$/, '')).filter((s) => s.length > 0)
  return [trimmedBase, ...parts].join('/')
}

export interface MediaTargetPaths {
  /** 该媒体独占目录（创建时用 intermediates）。 */
  dirUri: string
  displayUri: string
  thumbUri: string
}

/** 由 documents 目录构造某媒体的持久化目标路径。 */
export function mediaTargetPaths(documentDirUri: string, entryId: string, mediaId: string): MediaTargetPaths {
  if (!entryId) throw new Error('mediaTargetPaths: entryId 必填')
  if (!mediaId) throw new Error('mediaTargetPaths: mediaId 必填')
  const dirUri = joinUri(documentDirUri, MEDIA_ROOT, MEDIA_SUBDIR, entryId, mediaId)
  return {
    dirUri,
    displayUri: joinUri(dirUri, DISPLAY_FILENAME),
    thumbUri: joinUri(dirUri, THUMB_FILENAME),
  }
}

export interface MediaFileSystem {
  documentDirectoryUri(): string
  ensureDirectory(uri: string): void
  copy(sourceUri: string, destinationUri: string): void
  size(uri: string): number
  remove(uri: string): void
  exists(uri: string): boolean
}

export function createExpoMediaFileSystem(): MediaFileSystem {
  return {
    documentDirectoryUri() {
      return Paths.document.uri
    },

    ensureDirectory(uri) {
      new Directory(uri).create({ intermediates: true, idempotent: true })
    },

    copy(sourceUri, destinationUri) {
      new File(sourceUri).copySync(new File(destinationUri), { overwrite: true })
    },

    size(uri) {
      const file = new File(uri)
      return file.exists ? file.size : 0
    },

    remove(uri) {
      const file = new File(uri)
      if (file.exists) file.delete()
    },

    exists(uri) {
      return new File(uri).exists
    },
  }
}
