// 客户端 uuid（T012/T050 幂等键：核心实体 id = client_id）。
//
// 云端 `id`/`client_id` 为 uuid，客户端生成同一值作为幂等键。优先用运行时
// `crypto.randomUUID`（Hermes/Expo 可用时），否则退回 RFC4122 v4 的 Math.random 实现
// （仅本地临时标识，不用于安全场景）。

export function newUuid(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()

  const bytes = new Uint8Array(16)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
