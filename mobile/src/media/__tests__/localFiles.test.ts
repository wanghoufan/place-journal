import { joinUri, mediaTargetPaths, DISPLAY_FILENAME, THUMB_FILENAME } from '../localFiles'

describe('localFiles 路径（T047）', () => {
  it('joinUri 去掉首尾斜杠且不产生空段', () => {
    expect(joinUri('file:///documents/', 'place-journal', 'media')).toBe('file:///documents/place-journal/media')
    expect(joinUri('file:///documents', '/place-journal/', '/media')).toBe('file:///documents/place-journal/media')
  })

  it('mediaTargetPaths 按 SDD 10.2 目录结构生成', () => {
    const paths = mediaTargetPaths('file:///documents/', 'entry-1', 'media-1')
    expect(paths.dirUri).toBe('file:///documents/place-journal/media/entry-1/media-1')
    expect(paths.displayUri).toBe(`file:///documents/place-journal/media/entry-1/media-1/${DISPLAY_FILENAME}`)
    expect(paths.thumbUri).toBe(`file:///documents/place-journal/media/entry-1/media-1/${THUMB_FILENAME}`)
  })

  it('缺 entryId/mediaId 抛错', () => {
    expect(() => mediaTargetPaths('file:///documents/', '', 'm')).toThrow(/entryId/)
    expect(() => mediaTargetPaths('file:///documents/', 'e', '')).toThrow(/mediaId/)
  })
})
