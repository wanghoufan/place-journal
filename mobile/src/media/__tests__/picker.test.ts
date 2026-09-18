import {
  isPickerError,
  MediaPickerError,
  normalizePickerResult,
  permissionState,
} from '../picker'

const asset = (over: Record<string, unknown> = {}) => ({
  uri: 'file:///tmp/a.jpg',
  width: 4000,
  height: 3000,
  fileName: 'a.jpg',
  fileSize: 123,
  mimeType: 'image/jpeg',
  type: 'image',
  ...over,
})

describe('picker 归一化（T044/T045/T046）', () => {
  it('取消返回空数组', () => {
    expect(normalizePickerResult({ canceled: true, assets: null })).toEqual([])
    expect(normalizePickerResult(null)).toEqual([])
  })

  it('成功结果映射并保持顺序，过滤非图片资产', () => {
    const result = normalizePickerResult({
      canceled: false,
      assets: [asset({ uri: 'a' }), asset({ uri: 'v', type: 'video' }), asset({ uri: 'c', type: 'image' })] as never,
    })
    expect(result.map((a) => a.uri)).toEqual(['a', 'c'])
    expect(result[0]).toMatchObject({ width: 4000, height: 3000, fileName: 'a.jpg', fileSize: 123 })
  })

  it('原生错误结果抛 MediaPickerError', () => {
    const error = { code: 'E_NO_LIBRARY_PERMISSION', message: 'denied' }
    expect(isPickerError(error)).toBe(true)
    expect(() => normalizePickerResult(error)).toThrow(MediaPickerError)
  })

  it('权限三态映射（canAskAgain=false → blocked）', () => {
    expect(permissionState({ granted: true })).toBe('granted')
    expect(permissionState({ granted: false, canAskAgain: true })).toBe('denied')
    expect(permissionState({ granted: false, canAskAgain: false })).toBe('blocked')
  })
})
