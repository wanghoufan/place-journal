import {
  OwnerBindingBlockedError,
  assertOwnerForSync,
  evaluateOwnerBinding,
  ownerGateForSync,
} from '../owner'

describe('owner binding (R-03 / RF-04)', () => {
  it('classifies unbound / match / mismatch', () => {
    expect(evaluateOwnerBinding(null, 'owner-a')).toBe('unbound')
    expect(evaluateOwnerBinding(undefined, undefined)).toBe('unbound')
    expect(evaluateOwnerBinding('owner-a', 'owner-a')).toBe('match')
    expect(evaluateOwnerBinding('owner-a', 'owner-b')).toBe('mismatch')
    expect(evaluateOwnerBinding('owner-a', null)).toBe('mismatch')
  })

  it('allows push/pull only on match', () => {
    expect(ownerGateForSync('owner-a', 'owner-a')).toEqual({ allowed: true, state: 'match', reason: null })
    expect(ownerGateForSync(null, 'owner-a')).toEqual({
      allowed: false,
      state: 'unbound',
      reason: 'owner_unbound',
    })
    expect(ownerGateForSync('owner-a', 'owner-b')).toEqual({
      allowed: false,
      state: 'mismatch',
      reason: 'owner_mismatch',
    })
  })

  it('assertOwnerForSync throws a typed error on mismatch/unbound', () => {
    expect(() => assertOwnerForSync('owner-a', 'owner-a')).not.toThrow()
    try {
      assertOwnerForSync('owner-a', 'owner-b')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(OwnerBindingBlockedError)
      expect((error as OwnerBindingBlockedError).state).toBe('mismatch')
    }
    expect(() => assertOwnerForSync(null, 'owner-a')).toThrow(OwnerBindingBlockedError)
  })
})
