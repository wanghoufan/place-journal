// SecureStore 适配器（T055/T056 + 计划 Session storage / R4-03）。
//
// 口径（全计划唯一表述）：
//   - access/refresh token 只允许由本 adapter 持久化（supabase-js `auth.storage` = 本 adapter）；
//   - PKCE `code_verifier` 与 session 共用同一 adapter（supabase-js 自行写入），
//     因此换码在杀进程/冷启动后仍可读；
//   - token/verifier 禁止进入 SQLite、AsyncStorage、日志、截图与证据。
//
// 本文件不直接 import `expo-secure-store`：原生后端由调用方注入，纯逻辑可单测。

/** 原生安全存储后端（生产实现为 `expo-secure-store`；测试注入内存实现）。 */
export interface SecureStoreBackend {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

/** supabase-js `SupportedStorage` 的结构子集（get/set/remove）。 */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

/** 把原生后端包成 supabase-js 可用的异步 storage。 */
export function createSecureStoreAdapter(backend: SecureStoreBackend): AuthStorage {
  return {
    getItem: (key) => backend.getItemAsync(key),
    setItem: (key, value) => backend.setItemAsync(key, value),
    removeItem: (key) => backend.deleteItemAsync(key),
  }
}

/** 单键 JSON 文档存储（去重指纹记录等结构数据；不含 code/token）。 */
export interface JsonStore {
  read(): Promise<unknown>
  write(value: unknown): Promise<void>
}

export function createSecureJsonStore(backend: SecureStoreBackend, key: string): JsonStore {
  return {
    async read() {
      const raw = await backend.getItemAsync(key)
      if (raw == null) return null
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return null
      }
    },
    async write(value) {
      await backend.setItemAsync(key, JSON.stringify(value))
    },
  }
}

/** 内存后端：仅测试/探针使用，不持久化、不参与生产路径。 */
export function createMemorySecureStoreBackend(initial?: Record<string, string>): SecureStoreBackend {
  const map = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    async getItemAsync(key) {
      return map.has(key) ? (map.get(key) as string) : null
    },
    async setItemAsync(key, value) {
      map.set(key, value)
    },
    async deleteItemAsync(key) {
      map.delete(key)
    },
  }
}
