// OAuth 回调去重指纹与状态机（T054–T062 本地段，计划 §OAuth 回调去重状态机）。
//
// 持久记录只含 `fingerprintHash/status/received_at/updated_at/expires_at/error_class`：
// 绝不落 code、token 或完整 callback URL。TTL = received_at + 24h，由 sweeper 清理。
// 相同指纹在 received/exchanging/succeeded/terminal_reauth 任一状态下都不二次换码。

import {
  AUTH_CALLBACK_PATHNAME,
  OAUTH_FINGERPRINT_DOMAIN,
  OAUTH_FINGERPRINT_TTL_MS,
  OAUTH_FLOW_STATUSES,
  type AuthErrorClass,
  type OAuthFlowStatus,
} from './constants'
import { sha256Hex } from './sha256'
import type { JsonStore } from './secureStore'

export interface OAuthFingerprintRecord {
  fingerprintHash: string
  status: OAuthFlowStatus
  receivedAt: string
  updatedAt: string
  expiresAt: string
  errorClass: AuthErrorClass | null
}

/** 域隔离指纹：`SHA-256("place-journal-oauth-v1" + callbackPath + code)` 小写 hex。 */
export function computeCallbackFingerprint(code: string, callbackPath: string = AUTH_CALLBACK_PATHNAME): string {
  return sha256Hex(`${OAUTH_FINGERPRINT_DOMAIN}${callbackPath}${code}`)
}

export function makeFingerprintRecord(
  fingerprintHash: string,
  status: OAuthFlowStatus,
  nowMs: number,
  errorClass: AuthErrorClass | null = null,
): OAuthFingerprintRecord {
  const receivedAt = new Date(nowMs).toISOString()
  return {
    fingerprintHash,
    status,
    receivedAt,
    updatedAt: receivedAt,
    expiresAt: new Date(nowMs + OAUTH_FINGERPRINT_TTL_MS).toISOString(),
    errorClass,
  }
}

export function isFingerprintExpired(record: OAuthFingerprintRecord, nowMs: number): boolean {
  const at = Date.parse(record.expiresAt)
  return Number.isNaN(at) || at <= nowMs
}

function isValidRecord(value: unknown): value is OAuthFingerprintRecord {
  if (typeof value !== 'object' || value == null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.fingerprintHash === 'string' &&
    r.fingerprintHash.length > 0 &&
    typeof r.status === 'string' &&
    (OAUTH_FLOW_STATUSES as readonly string[]).includes(r.status) &&
    typeof r.receivedAt === 'string' &&
    typeof r.updatedAt === 'string' &&
    typeof r.expiresAt === 'string'
  )
}

export interface OAuthFingerprintRepo {
  get(fingerprintHash: string): Promise<OAuthFingerprintRecord | null>
  list(): Promise<OAuthFingerprintRecord[]>
  upsert(record: OAuthFingerprintRecord): Promise<void>
  /** 删除全部过期记录，返回删除条数。 */
  sweep(nowMs?: number): Promise<number>
}

export function createOAuthFingerprintRepo(store: JsonStore): OAuthFingerprintRepo {
  async function readAll(): Promise<OAuthFingerprintRecord[]> {
    const raw = await store.read()
    if (!Array.isArray(raw)) return []
    return raw.filter(isValidRecord)
  }

  return {
    async get(fingerprintHash) {
      const records = await readAll()
      return records.find((r) => r.fingerprintHash === fingerprintHash) ?? null
    },

    list: readAll,

    async upsert(record) {
      const records = await readAll()
      const next = records.filter((r) => r.fingerprintHash !== record.fingerprintHash)
      next.push(record)
      await store.write(next)
    },

    async sweep(nowMs = Date.now()) {
      const records = await readAll()
      const kept = records.filter((r) => !isFingerprintExpired(r, nowMs))
      const removed = records.length - kept.length
      if (removed > 0) await store.write(kept)
      return removed
    },
  }
}
