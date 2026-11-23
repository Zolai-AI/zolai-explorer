/**
 * Typed fetch wrapper for the Zolai Core API.
 *
 * Responsibilities:
 *   - attach `X-API-Key` when a key is stored in `localStorage` (never logged),
 *   - enforce a 15s timeout for ordinary requests, with explicit longer
 *     budgets available to long-running surfaces,
 *   - throw a single `ApiError` shape for every failure mode so the UI can
 *     branch on `kind` instead of sniffing strings,
 *   - surface HTTP 401 as `needsKey` so callers can prompt for a key instead of
 *     rendering a wall of text,
 *   - tolerate empty bodies (returns `undefined`) rather than throwing.
 */

import { authHeaderEntry } from './credentials'

const RAW_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

/** Versioned API surface, e.g. `/api/v1` or `https://host/api/v1`. */
export const API_BASE: string = String(RAW_BASE).replace(/\/+$/, '')

const IS_ABSOLUTE = /^https?:\/\//i.test(API_BASE)

/** Origin of the API host, or `''` for same-origin relative requests. */
export const API_ORIGIN: string = IS_ABSOLUTE ? new URL(API_BASE).origin : ''

/** `/health` lives outside `/api/v1` and is public (no key required). */
export const HEALTH_URL: string = `${API_ORIGIN}/health`

/** OpenAPI docs, server-rendered — link out only. */
export const DOCS_URL: string = `${API_ORIGIN}/docs`

/** Prometheus metrics — link out only. */
export const METRICS_URL: string = `${API_ORIGIN}/metrics`

/** Review workbench (server-rendered HTML) — link out only. */
export const REVIEW_URL: string = `${API_ORIGIN}/review/`

export const REQUEST_TIMEOUT_MS = 15_000

/** Headroom for server-side agent, assistant, and RAG work (server budget: 60s). */
export const LONG_RUNNING_TIMEOUT_MS = 65_000

export type ApiErrorKind =
  | 'http'
  | 'unauthorized'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'parse'

export class ApiError extends Error {
  readonly status: number
  readonly url: string
  readonly kind: ApiErrorKind

  constructor(message: string, status: number, url: string, kind: ApiErrorKind) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.kind = kind
  }

  /** True when the server rejected the request because a key is missing/invalid. */
  get needsKey(): boolean {
    return this.status === 401
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiRequestOptions = {
  method?: ApiMethod
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  /**
   * Use `path` verbatim instead of joining it onto `API_BASE`. Required for
   * endpoints that live *outside* the versioned surface — `/health` is public
   * and is served at the origin root, not at `/api/v1/health`.
   */
  absolute?: boolean
  /**
   * Send *this* key instead of the stored one, for exactly one request.
   *
   * This exists so sign-in can probe `/auth/me` with a candidate key **before**
   * anything is persisted — a wrong key must never overwrite a working one, and
   * a half-typed paste must never reach `localStorage`. The value lives in the
   * header and nowhere else: never logged, never in a URL, never cached.
   */
  apiKey?: string
  /**
   * Send *this* session token as `Authorization: Bearer` for exactly one request.
   *
   * Sign-out needs it: the local session is cleared first so the UI updates the
   * instant the user clicks, and the logout call then has to carry the token
   * explicitly, because by then the stored one is already gone.
   */
  bearerToken?: string
}

/** Absolute URL for an API path — relative paths are joined onto `API_BASE`. */
export function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${suffix}`
}

function isAbortLike(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError'
}

/** Per-segment cap for a rendered `loc` path — field names are short, so this
 *  only bounds server-supplied text (same spirit as the 300-char message cap). */
const LOC_SEGMENT_MAX = 40

/**
 * Render a FastAPI `loc` array as the offending request location —
 * `['body','question']` → `'body.question'`, `['body','items',0,'name']` →
 * `'body.items.0.name'` (numeric segments are array indexes, printed as-is).
 * Returns `''` when the loc is absent, empty, or not an array, so the caller
 * falls back to the bare message and never emits `undefined.` or stray dots.
 */
function locPrefix(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  const parts: string[] = []
  for (const seg of loc) {
    if (typeof seg === 'string' || typeof seg === 'number') {
      const s = String(seg).slice(0, LOC_SEGMENT_MAX)
      if (s !== '') parts.push(s)
    }
  }
  return parts.join('.')
}

/**
 * Per-item cap for a 422 array item that carries no `msg`. The joined line is
 * capped at 300 regardless; this stops one chatty item from spending the whole
 * budget and burying the others.
 */
const DETAIL_ITEM_MAX = 120

/**
 * Compact rendering of a 422 array item that carries **no `msg`** — which
 * pydantic/FastAPI does produce for some errors (`json_invalid`, the
 * `input`/`ctx` shapes), along with the hand-rolled objects zolai-core raises
 * on a few routes. `String({})` prints `[object Object]`, naming neither the
 * field nor the problem, so: prefer the item's own scalar fields as
 * `key=value` pairs; when nothing scalar survives, emit a short JSON fragment
 * of the item minus the `loc` that is already shown as the prefix. `loc` and
 * `msg` are never duplicated here — the caller owns the location prefix.
 *
 * This is a developer workbench, so a raw JSON fragment is honest and
 * actionable; `[object Object]` is neither.
 */
function renderItemWithoutMsg(item: Record<string, unknown>): string {
  const scalars: string[] = []
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) {
    if (key === 'loc' || key === 'msg') continue
    rest[key] = value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      scalars.push(`${key}=${value}`)
    }
  }
  if (scalars.length > 0) return scalars.join(' ')
  try {
    // A payload that came from `JSON.parse` cannot be circular, but a
    // hand-built `Response` (tests) or a BigInt-bearing object can throw.
    return JSON.stringify(rest)
  } catch {
    return ''
  }
}

/** Pull a short, human-readable message out of a FastAPI error envelope. */
function detailFromPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload.slice(0, 300)
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>
    const detail = rec.detail
    if (typeof detail === 'string') return detail.slice(0, 300)
    // zolai-core raises `HTTPException(detail={"error": …})` on several admin
    // routes, so unwrap that envelope rather than dropping the message.
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const inner = detail as Record<string, unknown>
      // A role-guard refusal is `{"error": "<reason>", "detail": "<sentence>"}`.
      // The reason is a machine token (`self_role_change`); the sentence is what
      // the server authored for a human, so it wins and the token is the
      // fallback for envelopes that carry only a code.
      if (typeof inner.detail === 'string' && inner.detail !== '') {
        return inner.detail.slice(0, 300)
      }
      if (typeof inner.error === 'string') return inner.error.slice(0, 300)
      if (typeof inner.message === 'string') return inner.message.slice(0, 300)
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => {
          if (item && typeof item === 'object') {
            const rec = item as Record<string, unknown>
            // Prefix the offending location so a 422 names *which* part of the
            // request the server rejected ("body.question: …"), not just what
            // is wrong with it. Without the loc the message reads as if the
            // feature itself is broken.
            const where = locPrefix(rec.loc)
            if ('msg' in rec) {
              const msg = String(rec.msg)
              return where ? `${where}: ${msg}` : msg
            }
            // Some pydantic/FastAPI items arrive without `msg`. Render the
            // item itself rather than letting `String({})` print
            // `[object Object]` into a user-facing message.
            const rendered = renderItemWithoutMsg(rec)
            if (rendered === '') return ''
            const located = where ? `${where}: ${rendered}` : rendered
            return located.slice(0, DETAIL_ITEM_MAX)
          }
          return String(item)
        })
        .filter((part) => part !== '')
        .join('; ')
        .slice(0, 300)
    }
    if (typeof rec.message === 'string') return rec.message.slice(0, 300)
    if (typeof rec.error === 'string') return rec.error.slice(0, 300)
  }
  return ''
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = REQUEST_TIMEOUT_MS } = options
  const url = options.absolute ? path : resolveUrl(path)

  const headers: Record<string, string> = { Accept: 'application/json' }
  // An explicit `apiKey` wins (sign-in verification); otherwise resolve from
  // the credentials store (session wins, else key, never both).
  if (options.bearerToken?.trim()) {
    headers['Authorization'] = `Bearer ${options.bearerToken.trim()}`
  } else if (options.apiKey?.trim()) {
    headers['X-API-Key'] = options.apiKey.trim()
  } else {
    const auth = authHeaderEntry()
    if (auth) headers[auth[0]] = auth[1]
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      mode: 'cors',
    })
  } catch (err) {
    if (timedOut) {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 0, url, 'timeout')
    }
    if (isAbortLike(err) || signal?.aborted) {
      throw new ApiError('Request cancelled', 0, url, 'aborted')
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Network request failed',
      0,
      url,
      'network',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = detailFromPayload(await response.clone().json())
    } catch {
      try {
        detail = detailFromPayload(await response.clone().text())
      } catch {
        detail = ''
      }
    }
    const kind: ApiErrorKind = response.status === 401 ? 'unauthorized' : 'http'
    const message =
      detail ||
      (response.status === 401
        ? 'Credential required or rejected'
        : `Request failed with HTTP ${response.status}`)
    throw new ApiError(message, response.status, url, kind)
  }

  let text: string
  try {
    text = await response.text()
  } catch (err) {
    if (timedOut) throw new ApiError(`Request timed out after ${timeoutMs}ms`, 0, url, 'timeout')
    throw new ApiError(
      err instanceof Error ? err.message : 'Could not read response body',
      response.status,
      url,
      'network',
    )
  }

  // Tolerate empty payloads (204-style) instead of throwing on JSON.parse('').
  if (text.trim() === '') return undefined as T

  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError('Malformed JSON in response', response.status, url, 'parse')
  }
}

export const apiGet = <T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) =>
  apiFetch<T>(path, { ...options, method: 'GET' })

/** GET an origin-relative path without the `/api/v1` prefix (e.g. `/health`). */
export const apiGetAbsolute = <T>(
  path: string,
  options: Omit<ApiRequestOptions, 'method' | 'body' | 'absolute'> = {},
) => apiFetch<T>(path, { ...options, method: 'GET', absolute: true })

export const apiPost = <T>(
  path: string,
  body: unknown,
  options: Omit<ApiRequestOptions, 'method'> = {},
) => apiFetch<T>(path, { ...options, method: 'POST', body })

export const apiPut = <T>(
  path: string,
  body: unknown,
  options: Omit<ApiRequestOptions, 'method'> = {},
) => apiFetch<T>(path, { ...options, method: 'PUT', body })
export const apiPatch = <T>(
  path: string,
  body: unknown,
  options: Omit<ApiRequestOptions, 'method'> = {},
) => apiFetch<T>(path, { ...options, method: 'PATCH', body })
