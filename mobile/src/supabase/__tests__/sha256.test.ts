import { sha256Hex, utf8Encode } from '../sha256'

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes UTF-8（含中文/emoji）与 node:crypto 一致', () => {
    expect(sha256Hex('中文')).toBe('72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21')
    expect(sha256Hex('😀emoji')).toBe('d90240cea5db1b5a36a7825bd5d2f01f0052ea818e185addfc9a955ba7cc68b0')
  })

  it('emits lowercase 64-hex', () => {
    expect(sha256Hex('place-journal')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('utf8Encode handles multi-byte and surrogate pairs', () => {
    const bytes = utf8Encode('中😀')
    expect(Array.from(bytes)).toEqual([0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80])
  })
})
