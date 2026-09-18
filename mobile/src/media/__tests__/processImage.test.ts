import { computeTargetSize, DISPLAY_MAX_EDGE, THUMB_MAX_EDGE } from '../processImage'

describe('computeTargetSize（T049 尺寸口径）', () => {
  it('横图按最长边等比缩放（display 2560 / thumb 640）', () => {
    expect(computeTargetSize(4000, 3000, DISPLAY_MAX_EDGE)).toEqual({ width: 2560, height: 1920 })
    expect(computeTargetSize(4000, 3000, THUMB_MAX_EDGE)).toEqual({ width: 640, height: 480 })
  })

  it('竖图按最长边缩放', () => {
    expect(computeTargetSize(3000, 4000, THUMB_MAX_EDGE)).toEqual({ width: 480, height: 640 })
  })

  it('小图不放大', () => {
    expect(computeTargetSize(100, 50, THUMB_MAX_EDGE)).toEqual({ width: 100, height: 50 })
  })

  it('非法尺寸/最长边抛错', () => {
    expect(() => computeTargetSize(0, 100, 640)).toThrow()
    expect(() => computeTargetSize(-1, 100, 640)).toThrow()
    expect(() => computeTargetSize(100, 100, 0)).toThrow()
  })
})
