import {
  createAuthService,
  type AuthBrowserOpener,
  type AuthClient,
  type AuthService,
  type AuthSession,
  type OwnerStore,
} from '../auth'
import { AUTH_REDIRECT_URI, OAUTH_EXCHANGE_UNCERTAIN_MS, OAUTH_FINGERPRINT_TTL_MS } from '../constants'
import { computeCallbackFingerprint, createOAuthFingerprintRepo, makeFingerprintRecord } from '../fingerprint'
import { createMemorySecureStoreBackend, createSecureJsonStore, type SecureStoreBackend } from '../secureStore'

const CALLBACK = AUTH_REDIRECT_URI
const T0 = Date.parse('2026-09-18T00:00:00.000Z')

interface Harness {
  service: AuthService
  auth: {
    getSession: jest.Mock
    exchangeCodeForSession: jest.Mock
    signInWithOAuth: jest.Mock
    signOut: jest.Mock
  }
  openAuthSession: jest.Mock
  repo: ReturnType<typeof createOAuthFingerprintRepo>
  backend: SecureStoreBackend
  setExchangeSession(session: AuthSession | null): void
  getBound(): string | null
}

/**
 * 内存 fake：`exchangeCodeForSession` 成功时把 session 写入 SecureStore（即 `getSession` 可再读），
 * 以此模拟 PKCE 换码后的持久化；单测不触网络、不触原生模块。
 */
function setup(options?: { session?: AuthSession | null; boundOwner?: string | null; time?: number }): Harness {
  const nowMs = options?.time ?? T0
  const initialSession = options?.session ?? null
  let session: AuthSession | null = initialSession
  let exchangeResult: AuthSession | null = initialSession
  let boundOwner: string | null = options?.boundOwner ?? null

  const authClient = {
    getSession: jest.fn(async () => ({ session, error: null as unknown })),
    exchangeCodeForSession: jest.fn(async () => {
      session = exchangeResult
      return { session, error: null as unknown }
    }),
    signInWithOAuth: jest.fn(async () => ({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      error: null as unknown,
    })),
    signOut: jest.fn(async () => ({ error: null as unknown })),
  }
  const ownerStore: OwnerStore = {
    getBoundOwner: () => boundOwner,
    setBoundOwner: (value) => {
      boundOwner = value
    },
  }
  const openAuthSession = jest.fn(async () => ({ type: 'cancel' as const }))
  const backend = createMemorySecureStoreBackend()
  const repo = createOAuthFingerprintRepo(createSecureJsonStore(backend, 'fp'))

  const service = createAuthService({
    auth: authClient as unknown as AuthClient,
    fingerprints: repo,
    ownerStore,
    openBrowser: { openAuthSession } as unknown as AuthBrowserOpener,
    now: () => nowMs,
  })

  return {
    service,
    auth: authClient,
    openAuthSession,
    repo,
    backend,
    setExchangeSession: (next) => {
      exchangeResult = next
    },
    getBound: () => boundOwner,
  }
}

describe('auth: callback success and idempotency', () => {
  it('exchanges once, persists only the hash, and reports unbound on first login', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })

    const outcome = await h.service.handleCallback(`${CALLBACK}?code=one-time-code`)
    expect(outcome).toEqual({ status: 'succeeded', userId: 'owner-1', binding: 'unbound' })
    expect(h.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(h.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code')

    const hash = computeCallbackFingerprint('one-time-code')
    expect(await h.repo.get(hash)).toMatchObject({ status: 'succeeded', errorClass: null })

    const persisted = (await h.backend.getItemAsync('fp')) ?? ''
    expect(persisted).toContain(hash)
    expect(persisted).not.toContain('one-time-code')
  })

  it('rejects a duplicate callback without a second exchange', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })
    await h.service.handleCallback(`${CALLBACK}?code=dup`)

    const second = await h.service.handleCallback(`${CALLBACK}?code=dup`)
    expect(second).toEqual({ status: 'duplicate', flowStatus: 'succeeded' })
    expect(h.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('binds the owner only after explicit confirmation', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })
    await h.service.handleCallback(`${CALLBACK}?code=c1`)
    expect(h.getBound()).toBeNull()

    await h.service.bindOwner('owner-1')
    expect(h.getBound()).toBe('owner-1')
    expect(await h.service.getOwnerGate('owner-1')).toEqual({ allowed: true, state: 'match', reason: null })
  })
})

describe('auth: redirect and provider error handling (T054)', () => {
  it('never exchanges on a wrong redirect', async () => {
    const h = setup()
    const outcome = await h.service.handleCallback('https://evil.example/auth/callback?code=leak')
    expect(outcome).toMatchObject({ status: 'invalid', reason: 'redirect_mismatch' })
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('handles provider error before code', async () => {
    const h = setup()
    const outcome = await h.service.handleCallback(`${CALLBACK}#error=access_denied&error_description=no`)
    expect(outcome).toEqual({ status: 'error', errorClass: 'provider_error' })
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})

describe('auth: uncertain / missing verifier (R4-03)', () => {
  it('fails safe without retry when the PKCE verifier is missing', async () => {
    const h = setup()
    h.auth.exchangeCodeForSession.mockResolvedValueOnce({
      session: null,
      error: new Error('PKCE code verifier not found in storage'),
    })

    const first = await h.service.handleCallback(`${CALLBACK}?code=lost-verifier`)
    expect(first).toEqual({ status: 'terminal_reauth', errorClass: 'missing_verifier' })

    const second = await h.service.handleCallback(`${CALLBACK}?code=lost-verifier`)
    expect(second).toEqual({ status: 'duplicate', flowStatus: 'terminal_reauth' })
    expect(h.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('treats an unreadable persisted session as terminal', async () => {
    const h = setup()
    h.auth.exchangeCodeForSession.mockResolvedValueOnce({ session: { user: { id: 'owner-1' } }, error: null })
    h.auth.getSession.mockResolvedValue({ session: null, error: null })

    const outcome = await h.service.handleCallback(`${CALLBACK}?code=ghost`)
    expect(outcome).toEqual({ status: 'terminal_reauth', errorClass: 'session_not_persisted' })
  })
})

describe('auth: uncertain exchanging uses OAUTH_EXCHANGE_UNCERTAIN_MS (P1-2)', () => {
  it('resolves a stale exchanging flow via session-first without re-exchanging', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })
    const hash = computeCallbackFingerprint('slow-code')
    await h.repo.upsert(makeFingerprintRecord(hash, 'exchanging', T0 - OAUTH_EXCHANGE_UNCERTAIN_MS - 1))

    const outcome = await h.service.handleCallback(`${CALLBACK}?code=slow-code`)
    expect(outcome).toEqual({ status: 'succeeded', userId: 'owner-1', binding: 'unbound' })
    expect((await h.repo.get(hash))?.status).toBe('succeeded')
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('downgrades a stale exchanging flow with no session to terminal_reauth', async () => {
    const h = setup()
    const hash = computeCallbackFingerprint('slow-code')
    await h.repo.upsert(makeFingerprintRecord(hash, 'exchanging', T0 - OAUTH_EXCHANGE_UNCERTAIN_MS - 1))

    const outcome = await h.service.handleCallback(`${CALLBACK}?code=slow-code`)
    expect(outcome).toEqual({ status: 'terminal_reauth', errorClass: 'interrupted_no_session' })
    expect((await h.repo.get(hash))?.status).toBe('terminal_reauth')
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('keeps a fresh exchanging callback idempotent (inside the window)', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })
    const hash = computeCallbackFingerprint('fresh-code')
    await h.repo.upsert(makeFingerprintRecord(hash, 'exchanging', T0))

    const outcome = await h.service.handleCallback(`${CALLBACK}?code=fresh-code`)
    expect(outcome).toEqual({ status: 'duplicate', flowStatus: 'exchanging' })
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})

describe('auth: interrupted flow recovery (session-first)', () => {
  it('downgrades to terminal_reauth when there is no valid session', async () => {
    const h = setup()
    const hash = computeCallbackFingerprint('interrupted')
    await h.repo.upsert(makeFingerprintRecord(hash, 'exchanging', T0))

    const outcome = await h.service.recoverSession()
    expect(outcome).toEqual({ status: 'terminal_reauth', errorClass: 'interrupted_no_session' })
    expect((await h.repo.get(hash))?.status).toBe('terminal_reauth')

    const late = await h.service.handleCallback(`${CALLBACK}?code=interrupted`)
    expect(late).toEqual({ status: 'duplicate', flowStatus: 'terminal_reauth' })
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('recovers as succeeded when a valid session is readable', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })
    const hash = computeCallbackFingerprint('interrupted')
    await h.repo.upsert(makeFingerprintRecord(hash, 'exchanging', T0))

    const outcome = await h.service.recoverSession()
    expect(outcome).toEqual({ status: 'recovered', userId: 'owner-1', binding: 'unbound' })
    expect((await h.repo.get(hash))?.status).toBe('succeeded')
  })

  it('reports no_session when nothing is pending', async () => {
    const h = setup()
    expect(await h.service.recoverSession()).toEqual({ status: 'no_session' })
  })
})

describe('auth: owner mismatch blocks sync (RF-04)', () => {
  it('blocks push/pull without mutating the bound owner', async () => {
    const h = setup({ session: { user: { id: 'owner-B' } }, boundOwner: 'owner-A' })

    const outcome = await h.service.handleCallback(`${CALLBACK}?code=b-code`)
    expect(outcome).toEqual({ status: 'owner_mismatch', userId: 'owner-B', boundOwner: 'owner-A' })
    expect(h.getBound()).toBe('owner-A')

    expect(await h.service.getOwnerGate('owner-B')).toEqual({
      allowed: false,
      state: 'mismatch',
      reason: 'owner_mismatch',
    })
    expect(await h.service.getOwnerGate(null)).toEqual({
      allowed: false,
      state: 'mismatch',
      reason: 'owner_mismatch',
    })
    expect((await h.service.getOwnerGate('owner-A')).allowed).toBe(true)
  })
})

describe('auth: login orchestration', () => {
  it('returns already_signed_in without opening a new transaction', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } } })
    expect(await h.service.login()).toMatchObject({ status: 'already_signed_in', userId: 'owner-1' })
    expect(h.auth.signInWithOAuth).not.toHaveBeenCalled()
    expect(h.openAuthSession).not.toHaveBeenCalled()
  })

  it('passes the exact redirect and handles browser cancel', async () => {
    const h = setup()
    h.openAuthSession.mockResolvedValueOnce({ type: 'cancel' })

    const outcome = await h.service.login()
    expect(outcome).toEqual({ status: 'cancelled' })
    expect(h.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', redirectTo: CALLBACK })
    expect(h.openAuthSession).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      CALLBACK,
    )
    expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('discards a stale flow and its verifier before a new single-flow login', async () => {
    const h = setup()
    const staleHash = computeCallbackFingerprint('old-code')
    await h.repo.upsert(makeFingerprintRecord(staleHash, 'exchanging', T0))
    h.setExchangeSession({ user: { id: 'owner-1' } })
    h.openAuthSession.mockResolvedValueOnce({ type: 'success', url: `${CALLBACK}?code=new-code` })

    const outcome = await h.service.login()
    expect(outcome).toMatchObject({ status: 'succeeded', userId: 'owner-1' })
    expect(h.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect((await h.repo.get(staleHash))?.status).toBe('terminal_reauth')
    expect(h.auth.exchangeCodeForSession).toHaveBeenCalledWith('new-code')
  })

  it('sweeps expired fingerprints so a new login is allowed', async () => {
    const h = setup()
    const expiredHash = computeCallbackFingerprint('expired-code')
    await h.repo.upsert(makeFingerprintRecord(expiredHash, 'succeeded', T0 - OAUTH_FINGERPRINT_TTL_MS - 1))
    h.setExchangeSession({ user: { id: 'owner-1' } })
    h.openAuthSession.mockResolvedValueOnce({ type: 'success', url: `${CALLBACK}?code=expired-code` })

    const outcome = await h.service.login()
    expect(outcome).toMatchObject({ status: 'succeeded' })
    expect(h.auth.exchangeCodeForSession).toHaveBeenCalledWith('expired-code')
  })

  it('signOut only clears local auth state', async () => {
    const h = setup({ session: { user: { id: 'owner-1' } }, boundOwner: 'owner-1' })
    await h.service.signOut()
    expect(h.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(h.getBound()).toBe('owner-1')
  })
})
