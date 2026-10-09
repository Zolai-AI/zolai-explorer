import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminUser,
  fetchAdminUsers,
  revokeAdminUserSessions,
  setAdminUserPassword,
  updateAdminUser,
} from './api'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A row as `GET /admin/users` returns it — `sanitize_user`, no hash. */
function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    username: 'founder',
    display_name: 'Peter Pau Sian Lian',
    role: 'admin',
    // The server stores `enabled` as 0 | 1 — the schema normalises it.
    enabled: 1,
    created_at: '2026-10-06 09:00:00',
    updated_at: '2026-10-06 09:00:00',
    last_login: null,
    ...overrides,
  }
}

function lastCall(mock: { mock: { calls: readonly unknown[][] } }): [string, RequestInit] {
  return mock.mock.calls.at(-1) as [string, RequestInit]
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => json({ items: [], count: 0 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchAdminUsers', () => {
  it('GETs the account list from the admin users route', async () => {
    fetchMock.mockImplementation(async () => json({ items: [user()], count: 1 }))

    const list = await fetchAdminUsers()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/users')
    expect(init.method).toBe('GET')
    expect(list.count).toBe(1)
    expect(list.items[0]?.username).toBe('founder')
    // The server never serves the argon2 hash — a panel must not expect one.
    expect(list.items[0]).not.toHaveProperty('password_hash')
  })

  it('normalises the numeric enabled flag to a boolean', async () => {
    fetchMock.mockImplementation(async () =>
      json({ items: [user({ enabled: 0 }), user({ id: 3, username: 'guest', enabled: 1 })], count: 2 }),
    )

    const list = await fetchAdminUsers()

    expect(list.items[0]?.enabled).toBe(false)
    expect(list.items[1]?.enabled).toBe(true)
  })

  it('tolerates a malformed body instead of breaking the panel', async () => {
    fetchMock.mockImplementation(async () => json({ items: 'nope' }))
    await expect(fetchAdminUsers()).resolves.toMatchObject({ items: [], count: 0 })
  })
})

describe('createAdminUser', () => {
  it('POSTs username, password, display name and role', async () => {
    fetchMock.mockImplementation(async () => json({ user: user() }, 201))

    const created = await createAdminUser({
      username: '  founder  ',
      password: 'long-enough-passphrase',
      display_name: 'Peter Pau Sian Lian',
      role: 'admin',
    })

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/users')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'founder',
      password: 'long-enough-passphrase',
      display_name: 'Peter Pau Sian Lian',
      role: 'admin',
    })
    expect(created.username).toBe('founder')
  })

  it('omits the optional display name when it is blank', async () => {
    fetchMock.mockImplementation(async () => json({ user: user() }, 201))

    await createAdminUser({ username: 'newbie', password: 'long-enough-passphrase' })

    const body = JSON.parse(lastCall(fetchMock)[1].body as string)
    expect(body).not.toHaveProperty('display_name')
    expect(body).not.toHaveProperty('role')
  })

  it('surfaces the server error for a duplicate username', async () => {
    fetchMock.mockImplementation(async () => json({ detail: { error: 'username_taken' } }, 409))
    await expect(
      createAdminUser({ username: 'founder', password: 'long-enough-passphrase' }),
    ).rejects.toThrow(/username_taken/)
  })
})

describe('updateAdminUser', () => {
  it('PUTs only the fields that were asked for', async () => {
    fetchMock.mockImplementation(async () => json({ user: user({ enabled: 0 }) }))

    await updateAdminUser('founder', { enabled: false })

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/users/founder')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ enabled: false })
  })

  it('sends a role change alone', async () => {
    fetchMock.mockImplementation(async () => json({ user: user({ role: 'member' }) }))

    await updateAdminUser('founder', { role: 'member' })

    expect(JSON.parse(lastCall(fetchMock)[1].body as string)).toEqual({ role: 'member' })
  })

  it('reports an honest 404 for an account that does not exist', async () => {
    fetchMock.mockImplementation(async () =>
      json({ detail: { error: 'user_not_found', username: 'ghost' } }, 404),
    )
    await expect(updateAdminUser('ghost', { enabled: true })).rejects.toThrow(/user_not_found/)
  })
})

describe('setAdminUserPassword', () => {
  it('PUTs the new password to the username/password route', async () => {
    fetchMock.mockImplementation(async () => json({ user: user() }))

    await setAdminUserPassword('founder', 'another-long-passphrase')

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/users/founder/password')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ password: 'another-long-passphrase' })
  })

  it('surfaces the server minimum instead of swallowing it', async () => {
    fetchMock.mockImplementation(async () => json({ detail: { error: 'invalid_input' } }, 400))
    await expect(setAdminUserPassword('founder', 'short')).rejects.toThrow(/invalid_input/)
  })
})

describe('revokeAdminUserSessions', () => {
  it('POSTs with an empty body and returns a count, never a token', async () => {
    fetchMock.mockImplementation(async () => json({ username: 'founder', revoked: 3 }))

    const result = await revokeAdminUserSessions('founder')

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/users/founder/revoke-sessions')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(result.revoked).toBe(3)
    expect(result).not.toHaveProperty('token')
  })
})
