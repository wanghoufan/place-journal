import { arrayBufferToBase64, base64ToArrayBuffer, stripBase64Prefix } from '../base64'

function toBase64(bytes: number[]): string {
  return arrayBufferToBase64(new Uint8Array(bytes).buffer)
}

function toBytes(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer))
}

describe('base64 ↔ ArrayBuffer', () => {
  it('解码普通 base64，逐字节一致', () => {
    const bytes = [0, 1, 2, 127, 128, 200, 254, 255, 74, 80, 71]
    expect(toBytes(base64ToArrayBuffer(toBase64(bytes)))).toEqual(bytes)
  })

  it('处理各长度余数（无 padding / 单 = / 双 =）', () => {
    for (const length of [1, 2, 3, 4, 5, 17, 64]) {
      const bytes = Array.from({ length }, (_, i) => (i * 31 + 7) % 256)
      expect(toBytes(base64ToArrayBuffer(toBase64(bytes)))).toEqual(bytes)
    }
  })

  it('去除 data URL 前缀与空白', () => {
    const bytes = [10, 20, 30, 40]
    const encoded = toBase64(bytes)
    expect(toBytes(base64ToArrayBuffer(`data:image/jpeg;base64,${encoded}`))).toEqual(bytes)
    expect(stripBase64Prefix(`data:image/jpeg;base64,${encoded}\n`)).toBe(encoded)
  })

  it('空串解码为零长度', () => {
    expect(toBytes(base64ToArrayBuffer(''))).toEqual([])
  })

  it('编码（诊断用）与 Buffer 一致', () => {
    const bytes = [9, 8, 7, 6, 5]
    const buffer = new Uint8Array(bytes).buffer
    expect(arrayBufferToBase64(buffer)).toBe(toBase64(bytes))
  })
})
