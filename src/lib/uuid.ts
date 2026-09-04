// crypto.randomUUID 仅在 Secure Context（HTTPS / localhost）存在；
// 局域网 http://192.168.x.x 访问时（手机）没有该 API，裸调用会直接抛错 → 统一走这里
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
