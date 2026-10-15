import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAiProviders,
  postActivateProvider,
  postTestProvider,
  putAiProvider,
} from './api'
import { postRefreshModels } from '../providers/api'
import { ApiError } from '../../lib/api'
import { API_KEY_STORAGE_KEY, __setStorageForTests } from '../../lib/key'
import type { StorageLike } from '../../lib/key'

function fakeStorage(): StorageLike {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ROW = {
  catalog_id: 'primary',
  name: 'Primary',
  adapter: 'brain',
  base_url: 'https://provider.example/v1',
  models: ['model-a'],
  selected_model: 'model-a',
  docs: '',
  requires_key: true,
  enabled: true,
  is_active: true,
  tier: 'free',
  timeout_s: 45,
  secret: { mode: 'env', ref_masked: '***K', configured: true },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  __setStorageForTests(fakeStorage())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  __setStorageForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit]
}

describe('fetchAiProviders', () => {
  it('GETs the catalog under /api/v1 and parses every row', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [ROW], count: 1 }))

    const list = await fetchAiProviders()

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/admin/ai-providers')
    expect(init.method ?? 'GET').toBe('GET')
    expect(list.count).toBe(1)
    expect(list.items[0].catalog_id).toBe('primary')
  })

  it('still returns an empty list when the payload is malformed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: 'nope', count: 'x' }))

    const list = await fetchAiProviders()

    expect(list.items).toEqual([])
    expect(list.count).toBe(0)
  })
})

describe('putAiProvider', () => {
  it('PUTs the update to the catalog row and returns the fresh row', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ROW))

    const row = await putAiProvider('primary', { selected_model: 'model-b', enabled: false })

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/admin/ai-providers/primary')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"selected_model":"model-b","enabled":false}')
    expect(row.selected_model).toBe('model-a') // server echoes its own row
  })

  it('sends the X-API-Key header — settings routes are scope-gated', async () => {
    __setStorageForTests({
      getItem: (k) => (k === API_KEY_STORAGE_KEY ? 'zl_admin_key' : null),
      setItem: () => {},
      removeItem: () => {},
    })
    fetchMock.mockResolvedValue(jsonResponse(ROW))

    await putAiProvider('primary', { name: 'Renamed' })

    const headers = lastCall()[1].headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('zl_admin_key')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('surfaces a 403 scope failure as an ApiError, not a parse error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: 'missing settings:write scope' }, 403),
    )

    await expect(putAiProvider('primary', { name: 'x' })).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 403,
    )
  })
})

describe('postActivateProvider', () => {
  it('POSTs with no body — activate needs a payload-free call', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ catalog_id: 'primary', is_active: true, active_count: 1 }),
    )

    const result = await postActivateProvider('primary')

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/admin/ai-providers/primary/activate')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect(result.is_active).toBe(true)
    expect(result.active_count).toBe(1)
  })

  it('404s honestly on an unknown catalog id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'unknown provider' }, 404))

    await expect(postActivateProvider('nope')).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 404,
    )
  })
})

describe('postTestProvider', () => {
  it('parses a passing 1-token probe', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        catalog_id: 'primary',
        ok: true,
        status: 200,
        latency_ms: 142.5,
        error: null,
        model: 'model-a',
      }),
    )

    const probe = await postTestProvider('primary')

    expect(lastCall()[1].method).toBe('POST')
    expect(probe.ok).toBe(true)
    expect(probe.latency_ms).toBeCloseTo(142.5)
    expect(probe.model).toBe('model-a')
  })

  it('parses a failed probe with a null status and an error string', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        catalog_id: 'primary',
        ok: false,
        status: 401,
        latency_ms: 30,
        error: 'invalid key',
        model: null,
      }),
    )

    const probe = await postTestProvider('primary')

    expect(probe.ok).toBe(false)
    expect(probe.error).toBe('invalid key')
    expect(probe.model).toBeNull()
  })
})

describe('refresh-models — the transport the Settings hook reuses', () => {
  it('POSTs to the admin refresh-models route with no body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ catalog_id: 'primary', models: ['model-a', 'model-b'], source: 'remote' }),
    )

    const result = await postRefreshModels('primary')

    const [url, init] = lastCall()
    expect(url).toBe('/api/v1/admin/ai-providers/primary/refresh-models')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(result.models).toEqual(['model-a', 'model-b'])
    expect(result.source).toBe('remote')
  })

  it('sends the X-API-Key header — refresh-models is settings:write', async () => {
    __setStorageForTests({
      getItem: (k) => (k === API_KEY_STORAGE_KEY ? 'zl_admin_key' : null),
      setItem: () => {},
      removeItem: () => {},
    })
    fetchMock.mockResolvedValue(
      jsonResponse({ catalog_id: 'primary', models: [], source: 'catalog' }),
    )

    await postRefreshModels('primary')

    const headers = lastCall()[1].headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('zl_admin_key')
  })

  it('surfaces a 403 scope failure as an ApiError, not a parse error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: 'missing settings:write scope' }, 403),
    )

    await expect(postRefreshModels('primary')).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.status === 403,
    )
  })
})

describe('useRefreshModels hook wiring (source guard)', () => {
  // The hook is React Query glue; the node env has no DOM to render it in, so
  // the wiring is pinned as source — same technique `routes.test.ts` uses for
  // the shell surfaces.
  const source = readFileSync(fileURLToPath(new URL('./api.ts', import.meta.url)), 'utf8')

  it('calls the shared providers transport rather than re-pathing the route', () => {
    expect(source).toMatch(/import \{ postRefreshModels \} from '\.\.\/providers\/api'/)
    expect(source).toContain('postRefreshModels(catalogId)')
    // No duplicated endpoint **path** in this feature file — it lives in the
    // endpoint registry only (the registry *id* in prose is fine).
    expect(source).not.toContain('/refresh-models')
  })

  it('invalidates the admin catalog so the model select re-reads', () => {
    expect(source).toMatch(/invalidateQueries\(\{ queryKey: QKEY \}\)/)
    expect(source).toMatch(/const QKEY = \['admin', 'ai-providers'\]/)
  })
})
