import {
  createMemorySecureStoreBackend,
  createSecureJsonStore,
  createSecureStoreAdapter,
} from '../secureStore'

describe('secure store adapter (T055/T056)', () => {
  it('round-trips values through the supabase storage shape', async () => {
    const backend = createMemorySecureStoreBackend()
    const storage = createSecureStoreAdapter(backend)
    expect(await storage.getItem('missing')).toBeNull()
    await storage.setItem('k', JSON.stringify({ access_token: 'a', refresh_token: 'r' }))
    expect(JSON.parse((await storage.getItem('k')) as string)).toEqual({ access_token: 'a', refresh_token: 'r' })
    await storage.removeItem('k')
    expect(await storage.getItem('k')).toBeNull()
  })

  it('persists across a simulated cold start (same backend, new adapter)', async () => {
    const backend = createMemorySecureStoreBackend()
    await createSecureStoreAdapter(backend).setItem('code-verifier', 'v1')
    expect(await createSecureStoreAdapter(backend).getItem('code-verifier')).toBe('v1')
  })

  it('json store reads/writes structured data and tolerates garbage', async () => {
    const backend = createMemorySecureStoreBackend({ doc: '{not json' })
    const store = createSecureJsonStore(backend, 'doc')
    expect(await store.read()).toBeNull()
    await store.write([{ a: 1 }])
    expect(await store.read()).toEqual([{ a: 1 }])
  })
})
