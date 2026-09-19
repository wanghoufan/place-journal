import type { AuthService, CallbackOutcome, RecoveryOutcome } from '../auth'
import { startAuthLifecycle, type AuthStartupDeps } from '../startup'

const CALLBACK = 'com.wanghoufan.placejournal://auth/callback?code=cold'

interface Harness {
  deps: AuthStartupDeps
  events: string[]
  sweep: jest.Mock
  recover: jest.Mock
  handle: jest.Mock
  subscribe: jest.Mock
  attach: jest.Mock
  getInitialUrl: jest.Mock
  unsubscribe: jest.Mock
  detach: jest.Mock
  onRecovery: jest.Mock
  emit(url: string): void
}

/**
 * 冷启动接线单测 harness：全部依赖为 mock，不触 Expo 原生模块、不做真实登录。
 * `events` 记录调用顺序，用于锁定 sweep → recover → attach → subscribe → initialUrl。
 */
function setup(options?: {
  configured?: boolean
  recovery?: RecoveryOutcome
  initialUrl?: string | null
}): Harness {
  const events: string[] = []
  const recovery: RecoveryOutcome = options?.recovery ?? { status: 'no_session' }
  let handler: ((url: string) => void) | null = null

  const sweep = jest.fn(async () => {
    events.push('sweep')
    return 0
  })
  const recover = jest.fn(async () => {
    events.push('recover')
    return recovery
  })
  const handle = jest.fn(async () => {
    events.push('handleCallback')
    return { status: 'duplicate', flowStatus: 'succeeded' } as CallbackOutcome
  })
  const unsubscribe = jest.fn()
  const detach = jest.fn()
  const subscribe = jest.fn((cb: (url: string) => void) => {
    events.push('subscribe')
    handler = cb
    return unsubscribe
  })
  const attach = jest.fn(() => {
    events.push('attach')
    return detach
  })
  const getInitialUrl = jest.fn(async () => {
    events.push('initialUrl')
    return options?.initialUrl ?? null
  })
  const onRecovery = jest.fn()

  const service = { sweepFingerprints: sweep, recoverSession: recover, handleCallback: handle } as unknown as AuthService

  const deps: AuthStartupDeps = {
    isConfigured: () => options?.configured ?? true,
    service: service as unknown as AuthStartupDeps['service'],
    getInitialUrl,
    subscribeAuthCallbacks: subscribe,
    attachAuthAutoRefresh: attach,
    onRecovery,
  }

  return {
    deps,
    events,
    sweep,
    recover,
    handle,
    subscribe,
    attach,
    getInitialUrl,
    unsubscribe,
    detach,
    onRecovery,
    emit: (url) => handler?.(url),
  }
}

describe('auth: cold-start lifecycle wiring (TASK-DEV-11 / DEV-05 P1-1)', () => {
  it('runs the fixed sequence sweep → recover → attach → subscribe → initialUrl → callback', async () => {
    const h = setup({ initialUrl: CALLBACK })

    const handle = await startAuthLifecycle(h.deps)

    expect(h.events).toEqual(['sweep', 'recover', 'attach', 'subscribe', 'initialUrl', 'handleCallback'])
    expect(h.handle).toHaveBeenCalledWith(CALLBACK)
    expect(handle.recovery).toEqual({ status: 'no_session' })
    expect(h.onRecovery).toHaveBeenCalledWith({ status: 'no_session' })
  })

  it('is idempotent across repeated cold starts (sweep runs again without error, no leftover state)', async () => {
    const h = setup()

    await startAuthLifecycle(h.deps)
    await startAuthLifecycle(h.deps)

    expect(h.sweep).toHaveBeenCalledTimes(2)
    expect(h.recover).toHaveBeenCalledTimes(2)
    expect(h.attach).toHaveBeenCalledTimes(2)
    expect(h.subscribe).toHaveBeenCalledTimes(2)
    expect(h.handle).not.toHaveBeenCalled()
  })

  it('downgrades to terminal_reauth when there is no session and still attaches listeners', async () => {
    const terminal: RecoveryOutcome = { status: 'terminal_reauth', errorClass: 'interrupted_no_session' }
    const h = setup({ recovery: terminal })

    const handle = await startAuthLifecycle(h.deps)

    expect(handle.recovery).toEqual(terminal)
    expect(h.onRecovery).toHaveBeenCalledWith(terminal)
    expect(h.attach).toHaveBeenCalledTimes(1)
    expect(h.subscribe).toHaveBeenCalledTimes(1)
  })

  it('continues the startup with owner binding when a session is recovered', async () => {
    const recovered: RecoveryOutcome = { status: 'recovered', userId: 'owner-1', binding: 'match' }
    const h = setup({ recovery: recovered, initialUrl: CALLBACK })

    const handle = await startAuthLifecycle(h.deps)

    expect(handle.recovery).toEqual(recovered)
    expect(h.events).toContain('attach')
    expect(h.events).toContain('subscribe')
    expect(h.handle).toHaveBeenCalledWith(CALLBACK)
  })

  it('routes lifetime scheme callbacks to handleCallback', async () => {
    const h = setup()
    await startAuthLifecycle(h.deps)

    h.emit(CALLBACK)
    expect(h.handle).toHaveBeenCalledWith(CALLBACK)
  })

  it('dispose() detaches the url listener and auto-refresh', async () => {
    const h = setup()
    const handle = await startAuthLifecycle(h.deps)

    handle.dispose()
    expect(h.unsubscribe).toHaveBeenCalledTimes(1)
    expect(h.detach).toHaveBeenCalledTimes(1)
  })

  it('skips everything when Supabase is not configured', async () => {
    const h = setup({ configured: false, initialUrl: CALLBACK })

    const handle = await startAuthLifecycle(h.deps)

    expect(handle.recovery).toBeNull()
    expect(h.events).toEqual([])
    expect(h.sweep).not.toHaveBeenCalled()
    expect(h.recover).not.toHaveBeenCalled()
    expect(h.attach).not.toHaveBeenCalled()
    expect(h.subscribe).not.toHaveBeenCalled()
    expect(h.getInitialUrl).not.toHaveBeenCalled()
    expect(() => handle.dispose()).not.toThrow()
  })
})
