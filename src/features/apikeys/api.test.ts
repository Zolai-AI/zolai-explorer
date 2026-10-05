import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApiKey,
  fetchApiKeys,
  isActiveKey,
  revokeApiKey,
  rotateApiKey,
} from './api'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A record as `GET /admin/api-keys` returns it: metadata, never plaintext. */
function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    name: 'mcp-server',
    key_prefix: 'zolai_sk_ab12',
    key_hash: 'a'.repeat(64),
    scopes: ['dataset:read', 'rag:read'],
    created_by: 'api',
    created_at: '2026-10-05 09:00:00',
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
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

describe('fetchApiKeys', () => {
  it('lists the key metadata', async () => {
    fetchMock.mockImplementation(async () => json({ items: [record()], count: 1 }))

    const list = await fetchApiKeys()

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/api-keys')
    expect(init.method).toBe('GET')
    expect(list.count).toBe(1)
    expect(list.items[0]?.name).toBe('mcp-server')
  })

  it('tolerates a malformed body instead of breaking the panel', async () => {
    fetchMock.mockImplementation(async () => json({ items: 'nope' }))
    await expect(fetchApiKeys()).resolves.toMatchObject({ items: [], count: 0 })
  })
})

describe('createApiKey', () => {
  it('POSTs the trimmed name and the parsed scope list', async () => {
    fetchMock.mockImplementation(async () => json({ key: record(), plaintext: 'zolai_sk_plain' }))

    const issued = await createApiKey({ name: '  mcp-server  ', scopes: ['dataset:read'] })

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/api-keys')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'mcp-server', scopes: ['dataset:read'] })
    expect(issued.plaintext).toBe('zolai_sk_plain')
  })

  it('omits expires_days and created_by when they are not supplied', async () => {
    fetchMock.mockImplementation(async () => json({ key: record(), plaintext: 'zolai_sk_plain' }))

    await createApiKey({ name: 'k', scopes: ['*'] })

    const body = JSON.parse(lastCall(fetchMock)[1].body as string)
    expect(body).not.toHaveProperty('expires_days')
    expect(body).not.toHaveProperty('created_by')
  })

  it('surfaces the server error for an unknown scope', async () => {
    fetchMock.mockImplementation(async () =>
      json({ detail: { error: "unknown scope 'nope'" } }, 422),
    )
    await expect(createApiKey({ name: 'k', scopes: ['nope'] })).rejects.toThrow(/unknown scope/)
  })
})

describe('rotateApiKey / revokeApiKey', () => {
  it('rotates by id with an empty POST body', async () => {
    fetchMock.mockImplementation(async () =>
      json({ key: record({ id: 4 }), plaintext: 'zolai_sk_new', old_id: 3 }),
    )

    const rotated = await rotateApiKey(3)

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/api-keys/3/rotate')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(rotated.old_id).toBe(3)
    expect(rotated.key.id).toBe(4)
  })

  it('revokes by id', async () => {
    fetchMock.mockImplementation(async () =>
      json({ id: 3, revoked_at: '2026-10-05 10:00:00' }),
    )

    const revoked = await revokeApiKey(3)

    expect(lastCall(fetchMock)[0]).toBe('/api/v1/admin/api-keys/3/revoke')
    expect(revoked.id).toBe(3)
  })

  it('reports an honest 404 for a key that no longer exists', async () => {
    fetchMock.mockImplementation(async () => json({ detail: { error: 'not found' } }, 404))
    await expect(revokeApiKey(99)).rejects.toThrow(/not found/)
  })
})

describe('isActiveKey', () => {
  it('is active when never revoked and without an expiry', () => {
    expect(isActiveKey(record({ revoked_at: null, expires_at: null }))).toBe(true)
  })

  it('is inactive once revoked', () => {
    expect(isActiveKey(record({ revoked_at: '2026-10-05 10:00:00' }))).toBe(false)
  })

  it('is inactive once the expiry has passed, active before it', () => {
    expect(isActiveKey(record({ expires_at: '2020-01-01 00:00:00' }))).toBe(false)
    expect(isActiveKey(record({ expires_at: '2999-01-01 00:00:00' }))).toBe(true)
  })
})