import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAuthHeader, authHeaderEntry, authSource, sessionUsername, sessionRole } from './credentials'
import { __setStorageForTests as setSessionStorage } from './sessionAuth'
import { __setStorageForTests as setKeyStorage } from './key'
import type { StorageLike } from './key'
import type { SessionPayload } from './sessionAuth'

function fakeStorage(): StorageLike & { dump: () => Record<string, string> } {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    dump: () => Object.fromEntries(mem),
  }
}

let sessionStore: ReturnType<typeof fakeStorage>
let keyStore: ReturnType<typeof fakeStorage>

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  const now = Date.now()
  return {
    token: 'sess_abcdefghijklmnop',
    expiresAt: now + 3600_000,
    username: 'testuser',
    role: 'member',
    ...overrides,
  }
}

beforeEach(() => {
  sessionStore = fakeStorage()
  keyStore = fakeStorage()
  setSessionStorage(sessionStore)
  setKeyStorage(keyStore)
})

afterEach(() => {
  setSessionStorage(null)
  setKeyStorage(null)
  vi.restoreAllMocks()
})

describe('resolveAuthHeader — session wins, else key, never both', () => {
  it('returns bearer when a valid session exists', () => {
    const session = makeSession()
    sessionStore.setItem('zolai.session', JSON.stringify(session))

    const header = resolveAuthHeader()
    expect(header).toEqual({ type: 'bearer', token: session.token })
  })

  it('returns api-key when no session but a key exists', () => {
    keyStore.setItem('zolai.apiKey', 'zolai_sk_abcdefghijklmnop')

    const header = resolveAuthHeader()
    expect(header).toEqual({ type: 'api-key', key: 'zolai_sk_abcdefghijklmnop' })
  })

  it('returns none when neither exists', () => {
    const header = resolveAuthHeader()
    expect(header).toEqual({ type: 'none' })
  })

  it('session WINS over key — never both headers', () => {
    const session = makeSession()
    sessionStore.setItem('zolai.session', JSON.stringify(session))
    keyStore.setItem('zolai.apiKey', 'zolai_sk_abcdefghijklmnop')

    const header = resolveAuthHeader()
    expect(header.type).toBe('bearer')
    expect(header).not.toEqual({ type: 'api-key', key: 'zolai_sk_abcdefghijklmnop' })
  })

  it('expired session is ignored → falls back to key', () => {
    const expired = makeSession({ expiresAt: Date.now() - 1000 })
    sessionStore.setItem('zolai.session', JSON.stringify(expired))
    keyStore.setItem('zolai.apiKey', 'zolai_sk_abcdefghijklmnop')

    const header = resolveAuthHeader()
    expect(header).toEqual({ type: 'api-key', key: 'zolai_sk_abcdefghijklmnop' })
  })

  it('malformed session JSON is ignored → falls back to key', () => {
    sessionStore.setItem('zolai.session', 'not-json')
    keyStore.setItem('zolai.apiKey', 'zolai_sk_abcdefghijklmnop')

    const header = resolveAuthHeader()
    expect(header).toEqual({ type: 'api-key', key: 'zolai_sk_abcdefghijklmnop' })
  })

  it('session missing required fields is ignored → falls back to key', () => {
    sessionStore.setItem('zolai.session', JSON.stringify({ token: 'only-token' }))
    keyStore.setItem('zolai.apiKey', 'zolai_sk_abcdefghijklmnop')

    const header = resolveAuthHeader()
    expect(header).toEqual({ type: 'api-key', key: 'zolai_sk_abcdefghijklmnop' })
  })
})

describe('authHeaderEntry — ready for fetch', () => {
  it('returns Authorization header for session', () => {
    const session = makeSession({ token: 'sess_token123' })
    sessionStore.setItem('zolai.session', JSON.stringify(session))

    const entry = authHeaderEntry()
    expect(entry).toEqual(['Authorization', 'Bearer sess_token123'])
  })

  it('returns X-API-Key header for key', () => {
    keyStore.setItem('zolai.apiKey', 'zolai_sk_key123')

    const entry = authHeaderEntry()
    expect(entry).toEqual(['X-API-Key', 'zolai_sk_key123'])
  })

  it('returns null when neither exists', () => {
    const entry = authHeaderEntry()
    expect(entry).toBeNull()
  })
})

describe('authSource — for UI display', () => {
  it('reports session when present', () => {
    sessionStore.setItem('zolai.session', JSON.stringify(makeSession()))
    expect(authSource()).toBe('session')
  })

  it('reports api-key when only key present', () => {
    keyStore.setItem('zolai.apiKey', 'zolai_sk_key123')
    expect(authSource()).toBe('api-key')
  })

  it('reports none when neither present', () => {
    expect(authSource()).toBe('none')
  })
})

describe('sessionUsername / sessionRole', () => {
  it('returns username/role from session', () => {
    const session = makeSession({ username: 'alice', role: 'admin' })
    sessionStore.setItem('zolai.session', JSON.stringify(session))

    expect(sessionUsername()).toBe('alice')
    expect(sessionRole()).toBe('admin')
  })

  it('returns null when no session', () => {
    expect(sessionUsername()).toBeNull()
    expect(sessionRole()).toBeNull()
  })

  it('returns null when session expired', () => {
    sessionStore.setItem('zolai.session', JSON.stringify(makeSession({ expiresAt: Date.now() - 1 })))
    expect(sessionUsername()).toBeNull()
    expect(sessionRole()).toBeNull()
  })
})