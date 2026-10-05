import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  HEALTH_URL,
  REQUEST_TIMEOUT_MS,
  apiFetch,
  apiGet,
  apiGetAbsolute,
  apiPost,
  apiPut,
  isApiError,
  resolveUrl,
} from './api'
import { API_KEY_STORAGE_KEY, __setStorageForTests } from './key'
import type { StorageLike } from './key'

/** Minimal in-memory Storage stand-in. */
function fakeStorage(): StorageLike & { dump: () => Record<string, string> } {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    dump: () => Object.fromEntries(mem),
  }
}

/** Read the last `fetch` call args from a loosely typed vi.fn() mock. */
function lastCall(mock: { mock: { calls: readonly unknown[][] } }): [string, RequestInit] {
  return mock.mock.calls.at(-1) as [string, RequestInit]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  __setStorageForTests(storage)
})

afterEach(() => {
  __setStorageForTests(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('apiFetch — errors', () => {
  it('throws ApiError with status 401 on a rejected key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'Invalid API key' }, 401)),
    )

    const error = await apiFetch('/knowledge/statistics').catch((e: unknown) => e)

    expect(isApiError(error)).toBe(true)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(401)
    expect(apiError.kind).toBe('unauthorized')
    expect(apiError.needsKey).toBe(true)
    expect(apiError.message).toContain('Invalid API key')
  })

  it('throws ApiError with a short message when the error envelope is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    const error = (await apiFetch('/knowledge/version').catch((e: unknown) => e)) as ApiError

    expect(apiError_kind(error)).toBe('http')
    expect(error.status).toBe(503)
    expect(error.message).toContain('503')
    expect(error.needsKey).toBe(false)
  })

  it('flattens a FastAPI 422 validation envelope into one readable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ detail: [{ msg: 'field required', loc: ['body', 'text'] }] }, 422),
      ),
    )

    const error = (await apiFetch('/analyze/sentence', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(error.status).toBe(422)
    expect(error.message).toContain('field required')
    expect(error.message).not.toContain('[object Object]')
  })
})

function apiError_kind(error: ApiError): string {
  return error.kind
}

describe('apiFetch — timeout', () => {
  it('aborts the request and throws a timeout ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }),
      ),
    )

    const error = (await apiFetch('/rag', { method: 'POST', body: {}, timeoutMs: 20 }).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('timeout')
    expect(error.status).toBe(0)
    expect(error.message).toContain('timed out')
    expect(error.message).toContain('20ms')
  })

  it('defaults to a 15s budget', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(15_000)
  })

  it('reports an external abort as `aborted`, not a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }),
      ),
    )

    const controller = new AbortController()
    const pending = apiFetch('/search', { method: 'POST', body: {}, signal: controller.signal })
    controller.abort()

    const error = (await pending.catch((e: unknown) => e)) as ApiError
    expect(error.kind).toBe('aborted')
    expect(error.status).toBe(0)
  })

  it('surfaces a transport failure as a network ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const error = (await apiFetch('/health').catch((e: unknown) => e)) as ApiError
    expect(error.kind).toBe('network')
    expect(error.message).toContain('Failed to fetch')
  })
})

describe('apiFetch — payloads', () => {
  it('returns parsed JSON for a healthy response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ status: 'ok', uptime_s: 12.5 })))

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok', uptime_s: 12.5 })
  })

  it('tolerates an empty body instead of throwing on JSON.parse("")', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))

    await expect(apiFetch('/word/x/forms')).resolves.toBeUndefined()
  })

  it('rejects malformed JSON with a parse ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{not json', { status: 200 })),
    )

    const error = (await apiFetch('/word/pasian').catch((e: unknown) => e)) as ApiError
    expect(error.kind).toBe('parse')
    expect(error.message).toContain('Malformed JSON')
  })
})

describe('apiFetch — key header', () => {
  it('omits X-API-Key when no key is stored', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/health')

    const headers = lastCall(fetchMock)[1].headers as Record<string, string>
    expect(headers['X-API-Key']).toBeUndefined()
  })

  it('sends X-API-Key when a key is stored, and never puts it in the URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    storage.setItem(API_KEY_STORAGE_KEY, 'zl_secret_key')

    await apiFetch('/knowledge/statistics')

    const [url, init] = lastCall(fetchMock)
    const headers = init.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('zl_secret_key')
    expect(url).not.toContain('zl_secret_key')
  })

  it('serialises a POST body and sets content-type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ text: 'a', tokens: ['a'] }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/analyze/sentence', { method: 'POST', body: { text: 'a' } })

    const init = lastCall(fetchMock)[1]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"text":"a"}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('serialises a PUT body with the PUT method (provider settings)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ catalog_id: 'pcore-brain' }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPut('/admin/ai-providers/pcore-brain', { selected_model: 'm1' })

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/ai-providers/pcore-brain')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"selected_model":"m1"}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('omits body and content-type when a POST has nothing to send', async () => {
    // activate/test are POSTs with no payload — a Content-Type with no body
    // makes some proxies reject the request.
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPost('/admin/ai-providers/pcore-brain/test', undefined)

    const init = lastCall(fetchMock)[1]
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })
})

describe('url resolution', () => {
  it('joins a relative path onto the API base', () => {
    expect(resolveUrl('/word/pasian')).toBe('/api/v1/word/pasian')
    expect(resolveUrl('word/pasian')).toBe('/api/v1/word/pasian')
  })

  it('passes an absolute URL through untouched', () => {
    expect(resolveUrl('https://other.host/api/v1/health')).toBe(
      'https://other.host/api/v1/health',
    )
  })

  it('keeps /health outside the /api/v1 prefix', () => {
    expect(HEALTH_URL.endsWith('/health')).toBe(true)
    expect(HEALTH_URL).not.toContain('/api/v1')
  })

  it('fetches /health verbatim, not as /api/v1/health', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: 'ok', uptime_s: 5 }))
    vi.stubGlobal('fetch', fetchMock)

    // Regression guard: /health lives at the origin root, outside /api/v1.
    await apiGetAbsolute(HEALTH_URL)

    expect(lastCall(fetchMock)[0]).toBe('/health')
  })

  it('still prefixes ordinary paths onto the API base', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiGet('/knowledge/version')

    expect(lastCall(fetchMock)[0]).toBe('/api/v1/knowledge/version')
  })
})

// The deployed studio is cross-origin from the API, so production builds pin an
// absolute VITE_API_BASE (see `.env.production`). These guards pin the derived
// origin-root URLs for that configuration.
describe('url resolution — absolute API base', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /** Re-import `./api` with a stubbed `VITE_API_BASE` — the URLs are import-time. */
  async function loadWithBase(base: string) {
    vi.stubEnv('VITE_API_BASE', base)
    vi.resetModules()
    return import('./api')
  }

  it('resolves /health against the API origin, never under /api/v1', async () => {
    const mod = await loadWithBase('https://api.zolai.space/api/v1')

    expect(mod.API_ORIGIN).toBe('https://api.zolai.space')
    expect(mod.HEALTH_URL).toBe('https://api.zolai.space/health')
    expect(mod.HEALTH_URL).not.toContain('/api/v1')
  })

  it('fetches the absolute /health URL verbatim', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: 'ok', uptime_s: 5 }))
    vi.stubGlobal('fetch', fetchMock)
    const mod = await loadWithBase('https://api.zolai.space/api/v1')

    await mod.apiGetAbsolute(mod.HEALTH_URL)

    // Regression guard: origin + /health, not origin + /api/v1/health.
    expect(lastCall(fetchMock)[0]).toBe('https://api.zolai.space/health')
  })

  it('still joins versioned paths onto the absolute base', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const mod = await loadWithBase('https://api.zolai.space/api/v1')

    await mod.apiGet('/word/pasian')

    expect(lastCall(fetchMock)[0]).toBe('https://api.zolai.space/api/v1/word/pasian')
  })

  it('derives link-out URLs from the absolute origin', async () => {
    const mod = await loadWithBase('https://api.zolai.space/api/v1')

    expect(mod.DOCS_URL).toBe('https://api.zolai.space/docs')
    expect(mod.METRICS_URL).toBe('https://api.zolai.space/metrics')
    expect(mod.REVIEW_URL).toBe('https://api.zolai.space/review/')
  })

  it('strips a trailing slash from the configured base', async () => {
    const mod = await loadWithBase('https://api.zolai.space/api/v1/')

    expect(mod.API_BASE).toBe('https://api.zolai.space/api/v1')
    expect(mod.HEALTH_URL).toBe('https://api.zolai.space/health')
  })
})