/**
 * The minting cap, tested as the pure rule it is.
 *
 * `POST /admin/api-keys` and `POST /admin/api-keys/{id}/rotate` both refuse a key
 * that would outrank the caller (`403 scope_above_actor`). The whole client-side
 * job is knowing which scopes outrank whom *before* sending, so this file is where
 * that is pinned: the two scope bands, the comparison direction, and the sentence
 * an operator reads instead of a 403.
 */
import { describe, expect, it } from 'vitest'
import { ADMIN_SCOPES, SUPERADMIN_SCOPES, mintRefusal, roleOfScopes } from './keyActions'

describe('roleOfScopes', () => {
  it('reads the superadmin band from either scope that grants it', () => {
    expect(SUPERADMIN_SCOPES).toEqual(['*', 'role:manage'])
    expect(roleOfScopes(['role:manage'])).toBe('superadmin')
    expect(roleOfScopes(['dataset:read', '*'])).toBe('superadmin')
  })

  it('reads the admin band, and stops short of superadmin', () => {
    expect(ADMIN_SCOPES).toEqual(['apikey:manage', 'settings:write', 'user:manage'])
    for (const scope of ADMIN_SCOPES) {
      expect(roleOfScopes([scope, 'rag:read'])).toBe('admin')
    }
  })

  it('treats a scope that elevates nothing as a member key', () => {
    expect(roleOfScopes(['dataset:read', 'agent:run'])).toBe('member')
    expect(roleOfScopes([])).toBe('member')
    // An unknown word is the server's problem to reject, not a reason to promote
    // the key here — the client must not invent a rank for it.
    expect(roleOfScopes(['not:a:real:scope'])).toBe('member')
  })
})

describe('mintRefusal', () => {
  it('allows a key at the caller’s own rank', () => {
    // Equal is the point: an admin issues admin keys every day.
    expect(mintRefusal(['user:manage'], 'admin')).toBeNull()
    expect(mintRefusal(['dataset:read'], 'member')).toBeNull()
    expect(mintRefusal(['role:manage'], 'superadmin')).toBeNull()
    expect(mintRefusal(['*'], 'superadmin')).toBeNull()
  })

  it('refuses the one step above, and names both ranks', () => {
    const refusal = mintRefusal(['dataset:read', 'role:manage'], 'admin')

    expect(refusal).toContain('superadmin')
    expect(refusal).toContain('and this credential is admin')
    expect(refusal).toContain('scope_above_actor')
  })

  it('names only the offending scope, not the whole list', () => {
    // Three words in, one of them the problem — a message that quotes the
    // innocent scopes sends the operator dropping the wrong one.
    const refusal = mintRefusal(['dataset:read', 'rag:read', 'role:manage'], 'member')

    expect(refusal).toContain('(role:manage)')
    expect(refusal).not.toContain('dataset:read,')
  })

  it('refuses a member any admin scope', () => {
    expect(mintRefusal(['user:manage'], 'member')).toContain('admin')
    expect(mintRefusal(['*'], 'member')).toContain('superadmin')
  })

  it('is a no-op for the top rank, which can mint anything the vocabulary allows', () => {
    for (const scope of ['*', 'role:manage', 'user:manage', 'dataset:read']) {
      expect(mintRefusal([scope], 'superadmin')).toBeNull()
    }
  })
})
