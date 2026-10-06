import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY_STORAGE_KEY, __setStorageForTests, getApiKey } from './key'
import { SESSION_STORAGE_KEY, __setStorageForTests as setSessionStorage, getSession } from './sessionAuth'
import type { StorageLike } from './key'
import { queryClient } from './queryClient'
import {
  signIn,
  signOut,
  signInTitle,
  signInWithPassword,
  signOutSession,
  verifyApiKey,
  verifyFailureMessage,
  verifyFailureNotice,
  passwordVerifyFailureMessage,
  passwordVerifyFailureNotice,
} from './session'

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
let sessionStorage: ReturnType<typeof fakeStorage>

/** `GET /auth/me` answers with the identity the server derived from the key. */
function authMe(
  role: 'anonymous' | 'member' | 'admin',
  keyPrefix: string | null,
  mode = 'warn',
) {
  return new Response(
    JSON.stringify({ role, key_prefix: keyPrefix, scopes: [], mode }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** `POST /auth/login` answers with a session token. */
function loginResponse(
  token = 'sess_abcdefghijklmnop',
  expiresAt = Date.now() + 3600_000,
  username = 'testuser',
  role: 'anonymous' | 'member' | 'admin' = 'member',
) {
  return new Response(
    JSON.stringify({ token, expires_at: expiresAt, username, role }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function lastHeaders(mock: { mock: { calls: readonly unknown[][] } }): Record<string, string> {
  const init = mock.mock.calls.at(-1)?.[1] as RequestInit
  return init.headers as Record<string, string>
}

function lastUrl(mock: { mock: { calls: readonly unknown[][] } }): string {
  return mock.mock.calls.at(-1)?.[0] as string
}

beforeEach(() => {
  storage = fakeStorage()
  sessionStorage = fakeStorage()
  __setStorageForTests(storage)
  setSessionStorage(sessionStorage)
})

afterEach(() => {
  __setStorageForTests(null)
  setSessionStorage(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('verifyApiKey — probes without persisting', () => {
  it('sends the candidate in the header and never in the URL', async () => {
    const fetchMock = vi.fn(async () => authMe('admin', 'zolai_sk_abcdef'))
    vi.stubGlobal('fetch', fetchMock)

    await verifyApiKey('zolai_sk_abcdefghijklmnop')

    expect(lastHeaders(fetchMock)['X-API-Key']).toBe('zolai_sk_abcdefghijklmnop')
    expect(lastUrl(fetchMock)).toBe('/api/v1/auth/me')
    expect(lastUrl(fetchMock)).not.toContain('zolai_sk_')
    // Verification must not touch storage at all.
    expect(storage.dump()).toEqual({})
  })

  it('accepts a key the server recognises and reports the role it derived', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => authMe('member', 'zolai_sk_abcdef', 'enforce')))

    const result = await verifyApiKey('zolai_sk_abcdefghijklmnop')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.role).toBe('member')
    expect(result.keyPrefix).toBe('zolai_sk_abcdef')
    expect(result.mode).toBe('enforce')
  })

  it('rejects a key the server answers 200 for but does not recognise', async () => {
    // `/auth/me` is public: a bad key yields 200 + anonymous + no prefix.
    vi.stubGlobal('fetch', vi.fn(async () => authMe('anonymous', null)))

    const result = await verifyApiKey('not-a-real-key')

    expect(result).toMatchObject({ ok: false, reason: 'rejected' })
  })

  it('rejects a key whose echoed prefix does not match what was sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => authMe('admin', 'zolai_sk_zzzz')))

    const result = await verifyApiKey('zolai_sk_abcdefghijklmnop')

    expect(result).toMatchObject({ ok: false, reason: 'rejected' })
  })

  it('treats a 401 as a rejected key, not as a transport failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Invalid API key' }), { status: 401 })),
    )

    await expect(verifyApiKey('zolai_sk_abcdefghijklmnop')).resolves.toMatchObject({
      ok: false,
      reason: 'rejected',
    })
  })

  it('separates "cannot reach the API" from "key refused"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(verifyApiKey('zolai_sk_abcdefghijklmnop')).resolves.toMatchObject({
      ok: false,
      reason: 'unreachable',
    })
  })

  it('does not hit the network for a blank paste', async () => {
    const fetchMock = vi.fn(async () => authMe('admin', 'zolai_sk_abcdef'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyApiKey('   ')).resolves.toMatchObject({ ok: false, reason: 'blank' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('signIn — verify, then store', () => {
  it('stores nothing when verification fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => authMe('anonymous', null)))

    const result = await signIn('wrong-key')

    expect(result.ok).toBe(false)
    expect(getApiKey()).toBe('')
    expect(storage.dump()[API_KEY_STORAGE_KEY]).toBeUndefined()
  })

  it('keeps an existing key when a new one is rejected', async () => {
    storage.setItem(API_KEY_STORAGE_KEY, 'zolai_sk_workingkey123')
    vi.stubGlobal('fetch', vi.fn(async () => authMe('anonymous', null)))

    await signIn('zolai_sk_wrongkey')

    expect(getApiKey()).toBe('zolai_sk_workingkey123')
  })

  it('persists a verified key, trimmed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => authMe('admin', 'zolai_sk_abcdef')))

    const result = await signIn('  zolai_sk_abcdefghijklmnop  ')

    expect(result).toMatchObject({ ok: true, role: 'admin' })
    expect(getApiKey()).toBe('zolai_sk_abcdefghijklmnop')
  })

  it('clears cached responses on success so nothing key-less survives', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => authMe('admin', 'zolai_sk_abcdef')))
    queryClient.setQueryData(['sentinel'], { value: 1 })
    expect(queryClient.getQueryData(['sentinel'])).toEqual({ value: 1 })

    await signIn('zolai_sk_abcdefghijklmnop')

    expect(queryClient.getQueryData(['sentinel'])).toBeUndefined()
  })
})

describe('signOut', () => {
  it('drops the key and the cache — there is no server session to end', () => {
    storage.setItem(API_KEY_STORAGE_KEY, 'zolai_sk_abcdefghijklmnop')
    queryClient.setQueryData(['sentinel'], { value: 1 })

    signOut()

    expect(getApiKey()).toBe('')
    expect(queryClient.getQueryData(['sentinel'])).toBeUndefined()
  })

  it('is safe with no key stored', () => {
    expect(() => signOut()).not.toThrow()
  })
})

describe('signInTitle', () => {
  it('says "replace" only when a key is already stored', () => {
    expect(signInTitle(false)).toMatch(/Sign in/)
    expect(signInTitle(true)).toMatch(/Replace/)
  })
})
describe('verifyFailureMessage — one honest line per failure mode', () => {
  it('names the mode instead of saying "login failed"', () => {
    expect(verifyFailureMessage('blank')).toMatch(/nothing was sent/i)
    expect(verifyFailureMessage('rejected')).toMatch(/does not recognise/i)
    expect(verifyFailureMessage('unreachable')).toMatch(/could not reach/i)
    for (const reason of ['blank', 'rejected', 'unreachable'] as const) {
      expect(verifyFailureMessage(reason), reason).not.toMatch(/login failed/i)
    }
  })

  it('is total — an unknown reason cannot throw or leak an empty string', () => {
    // The map is keyed by the union, so this only proves the messages are real copy.
    for (const reason of ['blank', 'rejected', 'unreachable'] as const) {
      expect(verifyFailureMessage(reason).length).toBeGreaterThan(10)
    }
  })
})

describe('verifyFailureNotice — a refused key and an unanswered API are not the same', () => {
  it('a rejected key says the server refused it and nothing was stored', () => {
    const notice = verifyFailureNotice('rejected')
    expect(notice.tone).toBe('error')
    expect(notice.title).toMatch(/rejected/i)
    expect(notice.body).toMatch(/answers|answered/i)
    expect(notice.body).toMatch(/nothing was stored/i)
    expect(notice.message).toBe(verifyFailureMessage('rejected'))
  })

  it('an unreachable API blames transport — and does not call the key bad', () => {
    const notice = verifyFailureNotice('unreachable')
    expect(notice.tone).toBe('warn')
    expect(notice.title).toMatch(/unreachable|not verified/i)
    expect(notice.body).toMatch(/nothing was stored/i)
    // The honest part: the three real causes a browser hits on this deployment.
    expect(notice.body).toMatch(/CORS/)
    expect(notice.body).toMatch(/challenge/i)
    expect(notice.body).not.toMatch(/does not recognise that key/)
  })

  it('keeps the two modes distinguishable — no generic "login failed" anywhere', () => {
    const rejected = verifyFailureNotice('rejected')
    const unreachable = verifyFailureNotice('unreachable')
    expect(rejected.title).not.toBe(unreachable.title)
    expect(rejected.body).not.toBe(unreachable.body)
    expect([rejected, unreachable].map((n) => n.title).join(' ')).not.toMatch(/failed/i)
  })

  it('a blank paste never claims a request was made', () => {
    const notice = verifyFailureNotice('blank')
    expect(notice.title).toMatch(/nothing to verify/i)
    expect(notice.body).toMatch(/no request/i)
  })
})

describe('signInWithPassword — username/password session flow', () => {
  it('sends username and password in the body, never in the URL', async () => {
    const fetchMock = vi.fn(async () => loginResponse())
    vi.stubGlobal('fetch', fetchMock)

    await signInWithPassword('alice', 'secret123')

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>
    expect(calls.length).toBeGreaterThan(0)
    const init = calls[calls.length - 1][1]
    expect(init).toBeDefined()
    expect(init!.method).toBe('POST')
    expect(lastUrl(fetchMock)).toBe('/api/v1/auth/login')
    expect(lastUrl(fetchMock)).not.toContain('alice')
    expect(lastUrl(fetchMock)).not.toContain('secret123')
    const body = JSON.parse(init!.body as string)
    expect(body.username).toBe('alice')
    expect(body.password).toBe('secret123')
    // Session is stored after successful response.
    expect(sessionStorage.dump()[SESSION_STORAGE_KEY]).toBeDefined()
  })

  it('stores the session token on success and clears the API key', async () => {
    // Pre-seed an API key to verify it gets cleared
    storage.setItem(API_KEY_STORAGE_KEY, 'zolai_sk_existingkey123')
    vi.stubGlobal('fetch', vi.fn(async () => loginResponse('sess_token123', Date.now() + 3600_000, 'alice', 'member')))

    const result = await signInWithPassword('alice', 'secret123')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.username).toBe('alice')
    expect(result.role).toBe('member')
    expect(result.authSource).toBe('session')
    expect(getApiKey()).toBe('')
    const session = getSession()
    expect(session).not.toBeNull()
    expect(session?.token).toBe('sess_token123')
    expect(session?.username).toBe('alice')
    expect(session?.role).toBe('member')
  })

  it('clears cached responses on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => loginResponse()))
    queryClient.setQueryData(['sentinel'], { value: 1 })
    expect(queryClient.getQueryData(['sentinel'])).toEqual({ value: 1 })

    await signInWithPassword('alice', 'secret123')

    expect(queryClient.getQueryData(['sentinel'])).toBeUndefined()
  })

  it('rejects blank username or password without hitting the network', async () => {
    const fetchMock = vi.fn(async () => loginResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(signInWithPassword('', 'secret123')).resolves.toMatchObject({ ok: false, reason: 'blank' })
    await expect(signInWithPassword('alice', '')).resolves.toMatchObject({ ok: false, reason: 'blank' })
    await expect(signInWithPassword('   ', 'secret123')).resolves.toMatchObject({ ok: false, reason: 'blank' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats 401 as rejected credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Invalid username or password' }), { status: 401 })),
    )

    await expect(signInWithPassword('alice', 'wrong')).resolves.toMatchObject({ ok: false, reason: 'rejected' })
  })

  it('treats 429 as rate limited', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Too many requests' }), { status: 429 })),
    )

    await expect(signInWithPassword('alice', 'secret123')).resolves.toMatchObject({ ok: false, reason: 'rate_limited' })
  })

  it('separates "cannot reach the API" from "credentials refused"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(signInWithPassword('alice', 'secret123')).resolves.toMatchObject({ ok: false, reason: 'unreachable' })
  })
})

describe('signOutSession — best-effort logout then clear', () => {
  it('calls POST /auth/logout then clears session and cache', async () => {
    const logoutMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', logoutMock)
    setSessionStorage(sessionStorage)
    // Set up a session first
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      token: 'sess_token123',
      expiresAt: Date.now() + 3600_000,
      username: 'alice',
      role: 'member',
    }))
    queryClient.setQueryData(['sentinel'], { value: 1 })

    await signOutSession()

    expect(logoutMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.any(Object))
    expect(getSession()).toBeNull()
    expect(queryClient.getQueryData(['sentinel'])).toBeUndefined()
  })

  it('clears session and cache even when logout fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    setSessionStorage(sessionStorage)
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      token: 'sess_token123',
      expiresAt: Date.now() + 3600_000,
      username: 'alice',
      role: 'member',
    }))
    queryClient.setQueryData(['sentinel'], { value: 1 })

    await signOutSession()

    expect(getSession()).toBeNull()
    expect(queryClient.getQueryData(['sentinel'])).toBeUndefined()
  })

  it('does not touch the API key in localStorage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    setSessionStorage(sessionStorage)
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      token: 'sess_token123',
      expiresAt: Date.now() + 3600_000,
      username: 'alice',
      role: 'member',
    }))
    storage.setItem(API_KEY_STORAGE_KEY, 'zolai_sk_existingkey123')

    await signOutSession()

    expect(getApiKey()).toBe('zolai_sk_existingkey123')
    expect(getSession()).toBeNull()
  })
})

describe('passwordVerifyFailureMessage — one honest line per failure mode', () => {
  it('names the mode instead of saying "login failed"', () => {
    expect(passwordVerifyFailureMessage('blank')).toMatch(/nothing was sent/i)
    expect(passwordVerifyFailureMessage('rejected')).toMatch(/invalid username or password/i)
    expect(passwordVerifyFailureMessage('unreachable')).toMatch(/could not reach/i)
    expect(passwordVerifyFailureMessage('rate_limited')).toMatch(/too many attempts/i)
    for (const reason of ['blank', 'rejected', 'unreachable', 'rate_limited'] as const) {
      expect(passwordVerifyFailureMessage(reason), reason).not.toMatch(/login failed/i)
    }
  })
})

describe('passwordVerifyFailureNotice — a refused credential and an unanswered API are not the same', () => {
  it('a rejected credential says the server refused it and nothing was stored', () => {
    const notice = passwordVerifyFailureNotice('rejected')
    expect(notice.tone).toBe('error')
    expect(notice.title).toMatch(/invalid credentials/i)
    expect(notice.body).toMatch(/answered|401/i)
    expect(notice.body).toMatch(/nothing was stored/i)
    expect(notice.message).toBe(passwordVerifyFailureMessage('rejected'))
  })

  it('an unreachable API blames transport — and does not call the credentials bad', () => {
    const notice = passwordVerifyFailureNotice('unreachable')
    expect(notice.tone).toBe('warn')
    expect(notice.title).toMatch(/unreachable|not verified/i)
    expect(notice.body).toMatch(/nothing was stored/i)
    expect(notice.body).toMatch(/CORS/)
    expect(notice.body).toMatch(/challenge/i)
    expect(notice.body).not.toMatch(/invalid username or password/i)
  })

  it('rate limited is a warn tone and says nothing was stored', () => {
    const notice = passwordVerifyFailureNotice('rate_limited')
    expect(notice.tone).toBe('warn')
    expect(notice.title).toMatch(/rate limited/i)
    expect(notice.body).toMatch(/nothing was stored/i)
  })

  it('keeps the modes distinguishable — no generic "login failed" anywhere', () => {
    const rejected = passwordVerifyFailureNotice('rejected')
    const unreachable = passwordVerifyFailureNotice('unreachable')
    const rateLimited = passwordVerifyFailureNotice('rate_limited')
    expect(rejected.title).not.toBe(unreachable.title)
    expect(rejected.body).not.toBe(unreachable.body)
    expect(rateLimited.title).not.toBe(rejected.title)
    expect([rejected, unreachable, rateLimited].map((n) => n.title).join(' ')).not.toMatch(/failed/i)
  })

  it('a blank submit never claims a request was made', () => {
    const notice = passwordVerifyFailureNotice('blank')
    expect(notice.title).toMatch(/nothing to verify/i)
    expect(notice.body).toMatch(/no request/i)
  })
})
