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
        jsonResponse({ detail: [{ msg: 'field required', loc: ['body', 'question'] }] }, 422),
      ),
    )

    const error = (await apiFetch('/analyze/sentence', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(error.status).toBe(422)
    // The `loc` must survive the flatten — "field required" alone made a
    // request-shape bug read like "RAG is broken" (issue #28).
    expect(error.message).toBe('body.question: field required')
    expect(error.message).not.toContain('[object Object]')
  })

  it('renders a numeric loc segment as the array index it is', async () => {
    expect(
      await messageFromDetail422([{ loc: ['body', 'items', 0, 'name'], msg: 'field required' }]),
    ).toBe('body.items.0.name: field required')
  })

  it('falls back to the bare message when loc is missing, empty, or not an array', async () => {
    expect(await messageFromDetail422([{ msg: 'field required' }])).toBe('field required')
    expect(await messageFromDetail422([{ msg: 'field required', loc: [] }])).toBe('field required')
    expect(await messageFromDetail422([{ msg: 'field required', loc: 'body' }])).toBe(
      'field required',
    )
    expect(await messageFromDetail422([{ msg: 'field required', loc: [null] }])).toBe(
      'field required',
    )
  })

  it('joins multiple located items into one line', async () => {
    expect(
      await messageFromDetail422([
        { loc: ['body', 'question'], msg: 'field required' },
        { loc: ['query', 'limit'], msg: 'value is not a valid integer' },
      ]),
    ).toBe('body.question: field required; query.limit: value is not a valid integer')
  })

  it('caps server-supplied loc segments so the line stays bounded', async () => {
    expect(await messageFromDetail422([{ loc: ['body', 'x'.repeat(200)], msg: 'm' }])).toBe(
      `body.${'x'.repeat(40)}: m`,
    )
  })
})

/** POST a 422 whose `detail` is `items`; return the resulting ApiError message. */
async function messageFromDetail422(items: unknown): Promise<string> {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: items }, 422)))
  const error = (await apiFetch('/analyze/sentence', {
    method: 'POST',
    body: {},
  }).catch((e: unknown) => e)) as ApiError
  return error.message
}

function apiError_kind(error: ApiError): string {
  return error.kind
}

/**
 * A `detail` array item is not always a `{loc, msg}` pair. Pydantic v2 emits
 * shapes that carry `type`/`input`/`ctx` and **no `msg`** (`json_invalid` is
 * one), and zolai-core raises hand-rolled objects on a few routes. Those fell
 * through to `String(item)`, which renders the literal `[object Object]` in a
 * UI error message — an artefact of type coercion that names neither the field
 * nor the problem. Each case pins the replacement string exactly, so the guard
 * fails if the fragment ever degrades back to a coercion artefact, invents a
 * message the server did not send, or duplicates the `loc` it already prefixes.
 */
const NO_MSG_CASES: ReadonlyArray<{ label: string; items: unknown[]; expected: string }> = [
  {
    label: 'a located type/input pair',
    items: [{ type: 'string_type', loc: ['body', 'question'], input: 42 }],
    expected: 'body.question: type=string_type input=42',
  },
  {
    label: 'a json_invalid item whose ctx is nested',
    items: [{ type: 'json_invalid', loc: ['body', 0], ctx: { error: 'Expecting value' } }],
    expected: 'body.0: type=json_invalid',
  },
  {
    label: 'an item with no loc',
    items: [{ type: 'extra_forbidden', input: 'nope' }],
    expected: 'type=extra_forbidden input=nope',
  },
  {
    label: 'an item with only nested fields',
    items: [{ loc: ['query', 'limit'], ctx: { ge: 1 } }],
    expected: 'query.limit: {"ctx":{"ge":1}}',
  },
  {
    label: 'a boolean scalar',
    items: [{ required: true }],
    expected: 'required=true',
  },
  {
    label: 'a completely empty object',
    items: [{}],
    expected: '{}',
  },
]

describe('detailFromPayload — array items with no msg', () => {
  for (const { label, items, expected } of NO_MSG_CASES) {
    it(`renders ${label} as the item itself, never [object Object]`, async () => {
      const message = await messageFromDetail422(items)
      expect(message).toBe(expected)
      expect(message).not.toContain('[object Object]')
    })
  }

  it('still renders a msg item alongside a msg-less one', async () => {
    expect(
      await messageFromDetail422([
        { loc: ['body', 'question'], msg: 'field required' },
        { loc: ['body', 'limit'], type: 'int_parsing', input: 'abc' },
      ]),
    ).toBe('body.question: field required; body.limit: type=int_parsing input=abc')
  })

  it('leaves non-object items coercing as they always did', async () => {
    expect(await messageFromDetail422(['plain string', 42, null])).toBe('plain string; 42; null')
  })

  it('caps a runaway fragment so it cannot bury the other items', async () => {
    const message = await messageFromDetail422([
      { loc: ['body'], ctx: { blob: 'x'.repeat(500) } },
      { loc: ['body', 'question'], msg: 'field required' },
    ])

    expect(message).not.toContain('[object Object]')
    // The whole line keeps the existing 300-char discipline…
    expect(message.length).toBeLessThanOrEqual(300)
    // …and one item may not spend it: the fragment is cut at the per-item cap,
    // so the readable second item survives instead of being truncated away.
    expect(message.split('; ')[0].length).toBeLessThanOrEqual(120)
    expect(message).toContain('body.question: field required')
  })
})

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
    const fetchMock = vi.fn(async () => jsonResponse({ catalog_id: 'primary' }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPut('/admin/ai-providers/primary', { selected_model: 'm1' })

    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/api/v1/admin/ai-providers/primary')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"selected_model":"m1"}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('omits body and content-type when a POST has nothing to send', async () => {
    // activate/test are POSTs with no payload — a Content-Type with no body
    // makes some proxies reject the request.
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPost('/admin/ai-providers/primary/test', undefined)

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