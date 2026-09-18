// 媒体本地持久层编排（T048/T049/T050 组合；SDD 10.2/10.3）。
//
// 流程：picker 结果（按选择顺序）→ 逐张 processImage 生成 display/thumb → 复制进
// App documents 持久目录 → media 行 + `upload_media` op 原子落库 → 首图回填封面。
//
// 依赖注入（`MediaServiceDeps`）让单测可 mock 文件系统与图片处理器，覆盖：复制、
// 缩略、顺序、封面、失败回滚。失败口径：
//   - 任一张处理/复制失败：删除本次已复制文件，不落任何 media 行（无半成品）；
//   - DB 事务失败：`saveMediaBatch` 整体回滚，本函数再清理已复制文件后抛错。
// 上传属 Sync 后续 Task（T051/T067），本轮只置空 remote/storage 字段、不接网络。

import type { PickedAsset } from './picker'
import type { ImageProcessor } from './processImage'
import { mediaTargetPaths, type MediaFileSystem } from './localFiles'
import type { Repository } from '../db/repository'
import { newUuid } from '../domain/ids'

export interface PersistPickedMediaInput {
  assets: PickedAsset[]
  entryId: string
  placeId: string
  /** 媒体上传 op 的依赖（如该 entry 的 upsert_entry op_id）。 */
  dependsOn?: string[]
  /** 是否把首图作为封面（默认 true，= 封面首图语义）。 */
  coverFromFirst?: boolean
  /** 统一时间戳（测试可固定）。 */
  now?: string
  /** 拍摄时间（可选，落 media.taken_at）。 */
  takenAt?: string | null
}

export interface PersistedMedia {
  id: string
  entryId: string
  placeId: string
  localDisplayPath: string
  localThumbPath: string
  width: number
  height: number
  bytes: number
  order: number
  opId: string
}

export interface MediaServiceDeps {
  fs: MediaFileSystem
  images: ImageProcessor
  /** 媒体 id 生成器（默认 uuid；测试可注入确定性序列）。 */
  newId?: () => string
}

export async function persistPickedMedia(
  deps: MediaServiceDeps,
  repo: Repository,
  input: PersistPickedMediaInput,
): Promise<PersistedMedia[]> {
  const newId = deps.newId ?? newUuid
  const now = input.now ?? new Date().toISOString()
  const documentDirUri = deps.fs.documentDirectoryUri()
  const createdFiles: string[] = []
  const drafts: Omit<PersistedMedia, 'opId'>[] = []

  try {
    for (let order = 0; order < input.assets.length; order++) {
      const asset = input.assets[order]
      const mediaId = newId()
      const target = mediaTargetPaths(documentDirUri, input.entryId, mediaId)

      deps.fs.ensureDirectory(target.dirUri)
      const processed = await deps.images.process(asset.uri)

      deps.fs.copy(processed.displayUri, target.displayUri)
      createdFiles.push(target.displayUri)
      deps.fs.copy(processed.thumbUri, target.thumbUri)
      createdFiles.push(target.thumbUri)

      const bytes = deps.fs.size(target.displayUri) + deps.fs.size(target.thumbUri)
      drafts.push({
        id: mediaId,
        entryId: input.entryId,
        placeId: input.placeId,
        localDisplayPath: target.displayUri,
        localThumbPath: target.thumbUri,
        width: processed.width,
        height: processed.height,
        bytes,
        order,
      })
    }

    const coverMediaId = input.coverFromFirst === false ? null : (drafts[0]?.id ?? null)
    const opIds = repo.saveMediaBatch(
      drafts.map((d) => ({
        id: d.id,
        entry_id: d.entryId,
        place_id: d.placeId,
        local_display_path: d.localDisplayPath,
        local_thumb_path: d.localThumbPath,
        width: d.width,
        height: d.height,
        bytes: d.bytes,
        taken_at: input.takenAt ?? null,
        sort_order: d.order,
        remote_path: null,
        remote_thumb_path: null,
        sync_status: 'local',
      })),
      { entryId: input.entryId, coverMediaId, dependsOn: input.dependsOn, now },
    )

    return drafts.map((draft, index) => ({ ...draft, opId: opIds[index] }))
  } catch (error) {
    for (const uri of createdFiles) {
      try {
        deps.fs.remove(uri)
      } catch {
        // 清理失败不掩盖原始错误；留下孤儿文件优于丢记录。
      }
    }
    throw error
  }
}
