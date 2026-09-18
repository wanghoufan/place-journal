import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import config from '../../../app.config'
import { AUTH_REDIRECT_URI } from '../constants'
import { buildAuthRedirectUri, isAllowedAuthRedirect, parseAuthCallback, resolveAuthRedirectUri } from '../redirect'

const CALLBACK = 'com.wanghoufan.placejournal://auth/callback'

describe('auth redirect contract (T054)', () => {
  it('locks the exact HD-02 baseline redirect', () => {
    expect(AUTH_REDIRECT_URI).toBe(CALLBACK)
    expect(buildAuthRedirectUri()).toBe(CALLBACK)
    expect(config.scheme).toBe('com.wanghoufan.placejournal')
  })

  it('keeps docs/AUTH_REDIRECT.md aligned with the code constant', () => {
    const doc = readFileSync(join(__dirname, '../../../docs/AUTH_REDIRECT.md'), 'utf8')
    expect(doc).toContain(AUTH_REDIRECT_URI)
  })

  it('accepts only the exact scheme/host/path', () => {
    expect(isAllowedAuthRedirect(CALLBACK)).toBe(true)
    expect(isAllowedAuthRedirect(`${CALLBACK}?code=abc`)).toBe(true)
    expect(isAllowedAuthRedirect('https://evil.example/auth/callback')).toBe(false)
    expect(isAllowedAuthRedirect('com.wanghoufan.placejournal://evil/callback')).toBe(false)
    expect(isAllowedAuthRedirect('com.wanghoufan.placejournal://auth/other')).toBe(false)
    expect(isAllowedAuthRedirect('com.wanghoufan.placejournal://auth/callback/extra')).toBe(false)
    expect(isAllowedAuthRedirect('not a url')).toBe(false)
  })

  it('resolveAuthRedirectUri rejects runtime drift', () => {
    expect(resolveAuthRedirectUri((p) => `com.wanghoufan.placejournal://${p}`)).toBe(CALLBACK)
    expect(() => resolveAuthRedirectUri(() => 'exp://127.0.0.1:8081/--/auth/callback')).toThrow(
      'AUTH_REDIRECT_DRIFT',
    )
  })
})

describe('parseAuthCallback', () => {
  it('extracts the code on the exact callback', () => {
    expect(parseAuthCallback(`${CALLBACK}?code=one-time`)).toEqual({
      kind: 'code',
      code: 'one-time',
      callbackPath: 'auth/callback',
    })
  })

  it('parses the code from the fragment as well', () => {
    expect(parseAuthCallback(`${CALLBACK}#code=frag`)).toMatchObject({ kind: 'code', code: 'frag' })
  })

  it('rejects wrong redirect without reading the code', () => {
    const parsed = parseAuthCallback('com.wanghoufan.placejournal://auth/callbackX?code=leak')
    expect(parsed).toMatchObject({ kind: 'invalid', reason: 'redirect_mismatch', errorClass: 'invalid_redirect' })
  })

  it('handles provider error before code', () => {
    const parsed = parseAuthCallback(`${CALLBACK}#error=access_denied&error_description=User+denied&code=x`)
    expect(parsed).toMatchObject({ kind: 'error', error: 'access_denied', errorClass: 'provider_error' })
    expect(parsed).not.toHaveProperty('code')
  })

  it('reports missing code', () => {
    expect(parseAuthCallback(CALLBACK)).toMatchObject({ kind: 'invalid', reason: 'missing_code' })
    expect(parseAuthCallback(`${CALLBACK}?code=`)).toMatchObject({ kind: 'invalid', reason: 'missing_code' })
  })
})
