// 相册多选 / 相机入口与 picker 结果恢复（T044/T045/T046；SDD 10.1、FR-026/FR-028）。
//
// 设计：把「原生调用」和「结果归一化」分开——
//   - `normalizePickerResult` / `permissionState` 是纯函数，可单测（mock picker 结果）；
//   - `createExpoMediaPicker` 才真正调用 expo-image-picker。
//
// 权限口径：相机在启动前显式请求，拒绝/不可再询问（canAskAgain=false）抛 `MediaPickerError`，
// 由 UI 回到手工填写；相册优先走系统 Photo Picker（Android 13+ 无需广泛媒体权限），
// 不主动申请媒体库权限（FR-029 / RF-06）。

import * as ImagePicker from 'expo-image-picker'

export type MediaSource = 'library' | 'camera'

/** 权限三态：granted / denied（可再询问）/ blocked（canAskAgain=false）。 */
export type PermissionState = 'granted' | 'denied' | 'blocked'

/** 归一化后的选择结果（原生字段裁剪，仅保留媒体链需要的）。 */
export interface PickedAsset {
  uri: string
  width: number
  height: number
  fileName?: string
  fileSize?: number
  mimeType?: string
}

/** picker 明确失败（非用户取消）：权限、原生错误等。 */
export class MediaPickerError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'MediaPickerError'
    this.code = code
  }
}

/** 相册多选：仅图片；开启多选与顺序返回（尺寸按 SDD，压缩延后到 processImage）。 */
export const LIBRARY_PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: true,
  selectionLimit: 0,
  orderedSelection: true,
  quality: 1,
  exif: false,
}

/** 相机：单选，不做 picker 侧裁剪（裁剪会破坏顺序/多选语义）。 */
export const CAMERA_PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 1,
  exif: false,
}

type PickerOutcome = ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null

/** 区分「原生错误结果」与「正常结果」：错误结果只有 code/message，没有 canceled。 */
export function isPickerError(value: PickerOutcome): value is ImagePicker.ImagePickerErrorResult {
  return !!value && !('canceled' in value) && 'code' in value && 'message' in value
}

/** 权限响应 → 三态。 */
export function permissionState(res: { granted: boolean; canAskAgain?: boolean }): PermissionState {
  if (res.granted) return 'granted'
  return res.canAskAgain === false ? 'blocked' : 'denied'
}

/**
 * picker 结果归一化：
 *   - null / canceled → []
 *   - 原生错误 → 抛 MediaPickerError
 *   - 成功 → 仅图片资产（保持返回顺序）
 */
export function normalizePickerResult(result: PickerOutcome): PickedAsset[] {
  if (!result) return []
  if (isPickerError(result)) throw new MediaPickerError(result.code, result.message)
  if (result.canceled) return []
  return result.assets
    .filter((asset) => asset.type == null || asset.type === 'image')
    .map((asset) => ({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? undefined,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
    }))
}

export interface MediaPicker {
  pickFromLibrary(): Promise<PickedAsset[]>
  pickFromCamera(): Promise<PickedAsset[]>
  /** Android Activity 被回收后取回丢失的 picker 结果（T045）。 */
  recoverPending(): Promise<PickedAsset[]>
  requestPermission(source: MediaSource): Promise<PermissionState>
}

export function createExpoMediaPicker(): MediaPicker {
  const picker: MediaPicker = {
    async pickFromLibrary() {
      const result = await ImagePicker.launchImageLibraryAsync(LIBRARY_PICK_OPTIONS)
      return normalizePickerResult(result)
    },

    async pickFromCamera() {
      const state = await picker.requestPermission('camera')
      if (state !== 'granted') {
        throw new MediaPickerError(`camera_${state}`, '相机权限未授予，可改用手工记录')
      }
      const result = await ImagePicker.launchCameraAsync(CAMERA_PICK_OPTIONS)
      return normalizePickerResult(result)
    },

    async recoverPending() {
      const result = await ImagePicker.getPendingResultAsync()
      return normalizePickerResult(result)
    },

    async requestPermission(source) {
      const res =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      return permissionState(res)
    },
  }
  return picker
}
