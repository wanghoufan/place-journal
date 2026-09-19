import { OAUTH_EXCHANGE_UNCERTAIN_MS, OAUTH_FINGERPRINT_DOMAIN, OAUTH_FINGERPRINT_TTL_MS } from '../constants'
import {
  computeCallbackFingerprint,
  createOAuthFingerprintRepo,
  isExchangeUncertain,
  isFingerprintExpired,
  makeFingerprintRecord,
} from '../fingerprint'
import { createMemorySecureStoreBackend, createSecureJsonStore } from '../secureStore'

function makeRepo() {
  const backend = createMemorySecureStoreBackend()
  return createOAuthFingerprintRepo(createSecureJsonStore(backend, 'fp'))
}

describe('oauth callback fingerprint (T054/T055)', () => {
  it('is deterministic and domain-separated', () => {
    const a = computeCallbackFingerprint('code-1')
    const b = computeCallbackFingerprint('code-1')
    const other = computeCallbackFingerprint('code-2')
    expect(a).toBe(b)
    expect(a).not.toBe(other)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    // 域前缀变化必须改变摘要
    expect(a).not.toBe(computeCallbackFingerprint('code-1', 'auth/other'))
    expect(OAUTH_FINGERPRINT_DOMAIN).toBe('place-journal-oauth-v1')
  })

  it('persists only hash + status/time fields, never the raw code', async () => {
    const repo = makeRepo()
    const hash = computeCallbackFingerprint('SECRET-CODE')
    await repo.upsert(makeFingerprintRecord(hash, 'succeeded', 1_000_000))
    const [record] = await repo.list()
    expect(record).toMatchObject({ fingerprintHash: hash, status: 'succeeded', errorClass: null })
    expect(JSON.stringify(record)).not.toContain('SECRET-CODE')
    expect(Object.keys(record!).sort()).toEqual([
      'errorClass',
      'expiresAt',
      'fingerprintHash',
      'receivedAt',
      'status',
      'updatedAt',
    ])
  })

  it('TTL = receivedAt + 24h and sweeper removes only expired records', async () => {
    const repo = makeRepo()
    const now = 10_000_000
    const fresh = makeFingerprintRecord('fresh', 'exchanging', now)
    const stale = makeFingerprintRecord('stale', 'succeeded', now - OAUTH_FINGERPRINT_TTL_MS - 1)
    await repo.upsert(fresh)
    await repo.upsert(stale)

    expect(Date.parse(fresh.expiresAt) - Date.parse(fresh.receivedAt)).toBe(OAUTH_FINGERPRINT_TTL_MS)
    expect(isFingerprintExpired(stale, now)).toBe(true)

    const removed = await repo.sweep(now)
    expect(removed).toBe(1)
    expect((await repo.list()).map((r) => r.fingerprintHash)).toEqual(['fresh'])
  })

  it('sweep is idempotent (the second run removes nothing)', async () => {
    const repo = makeRepo()
    const now = 10_000_000
    await repo.upsert(makeFingerprintRecord('stale', 'succeeded', now - OAUTH_FINGERPRINT_TTL_MS - 1))

    expect(await repo.sweep(now)).toBe(1)
    expect(await repo.sweep(now)).toBe(0)
  })

  it('upsert replaces an existing record with the same hash', async () => {
    const repo = makeRepo()
    const hash = computeCallbackFingerprint('code')
    await repo.upsert(makeFingerprintRecord(hash, 'received', 1))
    await repo.upsert(makeFingerprintRecord(hash, 'succeeded', 2))
    const records = await repo.list()
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('succeeded')
  })

  it('treats an exchanging flow as uncertain after the timeout window (P1-2)', () => {
    const base = makeFingerprintRecord('h', 'exchanging', 1_000_000)
    expect(isExchangeUncertain(base, 1_000_000 + OAUTH_EXCHANGE_UNCERTAIN_MS - 1)).toBe(false)
    expect(isExchangeUncertain(base, 1_000_000 + OAUTH_EXCHANGE_UNCERTAIN_MS)).toBe(true)
  })

  it('treats a process interruption as uncertain regardless of age', () => {
    const base = makeFingerprintRecord('h', 'exchanging', 1_000_000)
    expect(isExchangeUncertain(base, 1_000_000, { processInterrupted: true })).toBe(true)
  })

  it('never flags non-exchanging states as uncertain', () => {
    const succeeded = makeFingerprintRecord('h', 'succeeded', 1_000_000)
    expect(isExchangeUncertain(succeeded, Number.MAX_SAFE_INTEGER)).toBe(false)
  })

  it('ignores malformed persisted entries', async () => {
    const backend = createMemorySecureStoreBackend({ fp: JSON.stringify([{ junk: true }, null]) })
    const repo = createOAuthFingerprintRepo(createSecureJsonStore(backend, 'fp'))
    expect(await repo.list()).toEqual([])
  })
})
