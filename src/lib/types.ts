// 领域类型：与共享平台仓库 supabase/migrations（habit_tracker Schema）对应
// sync='conflict'：条件更新失败（revision 乐观锁），等待用户裁决（采用云端/保留本地）
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'failed' | 'conflict'

export interface Place {
  id: string
  name: string
  area?: string
  lat?: number
  lng?: number
  coordPrecision?: 'exact' | 'approx' | 'hidden'
  isPrivate?: boolean
  revision?: number            // 本地版本号：每次本地保存 +1（规范 V1.2 §5.2）
  baseRevision?: number        // 最后一次确认与云端一致的 revision（undefined = 从未上云，首推走 INSERT）
  demo?: boolean
  sync: SyncStatus
  createdAt: string
  updatedAt: string
}

export interface Entry {
  id: string
  placeId: string
  visitDate: string            // YYYY-MM-DD
  rating?: number              // 1-5
  budget?: number              // 人均
  transcript?: string          // 已确认转写
  notePrivate?: string
  notePublic?: string
  summary?: string
  coverMediaId?: string
  tagIds: string[]             // 仅叶子标签
  isPrivate?: boolean
  revision?: number            // 本地版本号：每次本地保存 +1（规范 V1.2 §5.2）
  baseRevision?: number        // 同 Place
  demo?: boolean
  sync: SyncStatus
  syncError?: string
  createdAt: string
  updatedAt: string
}

export interface MediaItem {
  id: string
  entryId: string
  placeId: string
  display?: Blob               // 本地展示图（压缩后）
  thumb?: Blob                 // 本地缩略图
  demoUri?: string             // 演示数据用 data URI
  width?: number
  height?: number
  bytes?: number
  takenAt?: string
  order: number
  remotePath?: string
  remoteThumbPath?: string
  sync: SyncStatus
}

export type DimensionKind = 'region' | 'type' | 'scene' | 'crowd' | 'custom'

export interface Dimension { id: string; name: string; kind: DimensionKind; sortOrder: number; revision?: number; baseRevision?: number; demo?: boolean }
export interface Tag { id: string; dimensionId: string; parentId?: string | null; name: string; alias?: string; sortOrder: number; revision?: number; baseRevision?: number; demo?: boolean }

export interface ShareItem {
  clientId: string             // 稳定幂等键：创建时生成，重试/补传不变（share_items.client_id）
  entryId?: string             // 来源记录 id（RQA-V-02：删记录级联撤销分享用；云端 payload 白名单自动剔除）
  coverMediaId?: string        // 封面媒体 id（同步时据此上传分享缩略图到公开桶）
  placeName: string
  area?: string
  rating?: number
  budget?: number
  reason?: string
  tags?: string[]
  coverUri?: string            // 公开桶 URL 或 data URI（本地快照）
  photos?: string[]            // 本地快照专用：该记录全部照片（封面第一，blob URL）——仅用于本地生成分享长图，云端 payload 白名单不含此字段
  lat?: number
  lng?: number
  coordHidden?: boolean
}

export interface ShareSnapshot {
  id: string
  slug: string
  kind: 'single' | 'list'
  title: string
  ownerName?: string
  items: ShareItem[]
  status: 'active' | 'revoked'
  createdAt: string
}

// AI 固定 JSON 合同（方案 5.2）
export interface AiOrganizeResult {
  score?: number
  budget?: number
  summary?: string
  matched_tags: string[]        // 标签名（客户端映射为 id）
  unmatched_suggestions: string[]
  confidence?: number
}

export interface DraftPhoto { localId: string; display?: Blob; thumb?: Blob; demoUri?: string; width?: number; height?: number }

export interface RecordDraft {
  photos: DraftPhoto[]
  placeId?: string
  newPlaceName?: string
  newPlaceArea?: string
  transcript?: string
  ai?: AiOrganizeResult
  aiMock?: boolean
}
