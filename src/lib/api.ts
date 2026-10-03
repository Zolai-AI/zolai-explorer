/**
 * Typed fetch wrapper for the Zolai Core API.
 *
 * Responsibilities:
 *   - attach `X-API-Key` when a key is stored in `localStorage` (never logged),
 *   - enforce a 15s timeout via AbortController,
 *   - throw a single `ApiError` shape for every failure mode so the UI can
 *     branch on `kind` instead of sniffing strings,
 *   - surface HTTP 401 as `needsKey` so callers can prompt for a key instead of
 *     rendering a wall of text,
 *   - tolerate empty bodies (returns `undefined`) rather than throwing.
 */

import { getApiKey } from './key'

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

export type ApiRequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
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

/** Pull a short, human-readable message out of a FastAPI error envelope. */
function detailFromPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload.slice(0, 300)
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>
    const detail = rec.detail
    if (typeof detail === 'string') return detail.slice(0, 300)
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg)
          }
          return String(item)
        })
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
  const url = resolveUrl(path)

  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = getApiKey()
  if (key) headers['X-API-Key'] = key
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
        ? 'API key required or rejected'
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

export const apiPost = <T>(
  path: string,
  body: unknown,
  options: Omit<ApiRequestOptions, 'method'> = {},
) => apiFetch<T>(path, { ...options, method: 'POST', body })