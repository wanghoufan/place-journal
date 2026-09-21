// base64 → ArrayBuffer（TASK-DEV-08；R-06）。
//
// React Native 下 Supabase Storage 上传必须使用 ArrayBuffer（Blob/File/FormData 不按预期工作），
// 而 `expo-file-system` 的 `File.base64()` 读文件返回 base64 字符串，故在此解码。
// 纯函数、无原生依赖：Hermes 不一定有 atob，优先用全局 atob，缺省回退手写解码。

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1)
  for (let i = 0; i < BASE64_CHARS.length; i++) table[BASE64_CHARS.charCodeAt(i)] = i
  return table
})()

/** 去掉 `data:*;base64,` 前缀与空白；无前缀时原样返回。 */
export function stripBase64Prefix(input: string): string {
  const comma = input.indexOf(',')
  if (input.startsWith('data:') && comma >= 0) return input.slice(comma + 1).replace(/\s+/g, '')
  return input.replace(/\s+/g, '')
}

/** base64 字符串 → ArrayBuffer（忽略 padding，非法字符跳过）。 */
export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const text = stripBase64Prefix(input)
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff
    return bytes.buffer
  }

  let length = text.length
  while (length > 0 && text[length - 1] === '=') length--
  const byteLength = Math.floor((length * 3) / 4)
  const bytes = new Uint8Array(byteLength)
  let byteIndex = 0
  let buffer = 0
  let bits = 0
  for (let i = 0; i < length; i++) {
    const code = B64_LOOKUP[text.charCodeAt(i)]
    if (code < 0) continue
    buffer = (buffer << 6) | code
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[byteIndex++] = (buffer >> bits) & 0xff
    }
  }
  return bytes.buffer.slice(0, byteIndex)
}

/** ArrayBuffer → base64（测试/诊断用，与真源逐字节一致）。 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += BASE64_CHARS[a >> 2]
    out += BASE64_CHARS[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += i + 1 < bytes.length ? BASE64_CHARS[((b & 15) << 2) | ((c ?? 0) >> 6)] : '='
    out += i + 2 < bytes.length ? BASE64_CHARS[c & 63] : '='
  }
  return out
}
