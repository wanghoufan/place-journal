// display / thumb 生成（T049；SDD 10.3、FR-031 前置）。
//
// 尺寸口径对齐现役 Web `src/lib/image.ts`：display 最长边 2560 / thumb 640，
// JPEG 质量 display 0.85 / thumb 0.7；不放大原图（scale = min(1, maxEdge/最长边)）。
// 重编码天然清除 EXIF/GPS，原图不上云（只上传 display/thumb）。
//
// `computeTargetSize` 为纯函数可单测；`ImageProcessor` 抽象 expo-image-manipulator，
// 测试可注入假处理器；`createExpoImageProcessor` 才碰原生。

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

export const DISPLAY_MAX_EDGE = 2560
export const THUMB_MAX_EDGE = 640
export const DISPLAY_QUALITY = 0.85
export const THUMB_QUALITY = 0.7

export interface ProcessedImage {
  /** display 结果临时 URI（cache 内，随后复制到持久目录）。 */
  displayUri: string
  /** thumb 结果临时 URI。 */
  thumbUri: string
  /** 存储用尺寸：display 结果尺寸（与 Web 的 width/height 口径一致）。 */
  width: number
  height: number
}

export interface ImageProcessor {
  process(sourceUri: string): Promise<ProcessedImage>
}

/** 按最长边等比缩放，不放大；非法尺寸抛错（让上层回滚）。 */
export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`computeTargetSize: 非法图片尺寸 ${width}x${height}`)
  }
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    throw new Error(`computeTargetSize: 非法最长边 ${maxEdge}`)
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function createExpoImageProcessor(): ImageProcessor {
  return {
    async process(sourceUri) {
      const original = await ImageManipulator.manipulate(sourceUri).renderAsync()
      const sourceWidth = original.width
      const sourceHeight = original.height
      const displaySize = computeTargetSize(sourceWidth, sourceHeight, DISPLAY_MAX_EDGE)
      const thumbSize = computeTargetSize(sourceWidth, sourceHeight, THUMB_MAX_EDGE)

      const display = await ImageManipulator.manipulate(sourceUri)
        .resize(displaySize)
        .renderAsync()
        .then((ref) => ref.saveAsync({ compress: DISPLAY_QUALITY, format: SaveFormat.JPEG }))

      const thumb = await ImageManipulator.manipulate(sourceUri)
        .resize(thumbSize)
        .renderAsync()
        .then((ref) => ref.saveAsync({ compress: THUMB_QUALITY, format: SaveFormat.JPEG }))

      return { displayUri: display.uri, thumbUri: thumb.uri, width: displaySize.width, height: displaySize.height }
    },
  }
}
