import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSession,
  hasSession,
  setSession,
  clearSession,
  maskSessionToken,
  subscribeSession,
  __setStorageForTests,
  type SessionPayload,
  type StorageLike,
} from './sessionAuth'

function fakeStorage(): StorageLike & { dump: () => Record<string, string> } {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    dump: () => Object.fromEntries(mem),
  }
}

let storage: ReturnType<typeof fakeStorage>

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
  storage = fakeStorage()
  __setStorageForTests(storage)
})

afterEach(() => {
  __setStorageForTests(null)
  vi.restoreAllMocks()
})

describe('sessionAuth — sessionStorage store', () => {
  it('writes then reads the same value back', () => {
    const session = makeSession()
    setSession(session)
    const got = getSession()
    expect(got).toEqual(session)
  })

  it('persists under the documented storage key', () => {
    expect(storage.getItem('zolai.session')).toBeNull()
    setSession(makeSession())
    expect(storage.getItem('zolai.session')).not.toBeNull()
  })

  it('clears the stored session and reports no session', () => {
    setSession(makeSession())
    clearSession()
    expect(getSession()).toBeNull()
    expect(hasSession()).toBe(false)
  })

  it('expired session is dropped silently', () => {
    const expired = makeSession({ expiresAt: Date.now() - 1000 })
    storage.setItem('zolai.session', JSON.stringify(expired))
    expect(getSession()).toBeNull()
    expect(storage.getItem('zolai.session')).toBeNull()
  })

  it('malformed JSON is ignored', () => {
    storage.setItem('zolai.session', 'not-json')
    expect(getSession()).toBeNull()
  })

  it('missing required fields is ignored', () => {
    storage.setItem('zolai.session', JSON.stringify({ token: 'only-token' }))
    expect(getSession()).toBeNull()
  })

  it('returns null when storage is empty', () => {
    expect(getSession()).toBeNull()
    expect(hasSession()).toBe(false)
  })

  it('notifies subscribers on set and clear, and stops after unsubscribe', () => {
    let calls = 0
    const unsubscribe = subscribeSession(() => {
      calls += 1
    })
    setSession(makeSession())
    expect(calls).toBe(1)
    clearSession()
    expect(calls).toBe(2)
    unsubscribe()
    setSession(makeSession())
    expect(calls).toBe(2)
  })
})

describe('maskSessionToken — never reveals the full secret', () => {
  it('masks the middle of a token', () => {
    const masked = maskSessionToken('sess_token12345678')
    expect(masked).toContain('sess')
    expect(masked).toContain('678')
    expect(masked).not.toContain('token12345')
  })

  it('fully masks a short token', () => {
    expect(maskSessionToken('short')).toBe('•••••')
  })

  it('renders a dash when there is no token', () => {
    expect(maskSessionToken('')).toBe('—')
  })

  it('handles whitespace-only input', () => {
    expect(maskSessionToken('   ')).toBe('—')
  })
})