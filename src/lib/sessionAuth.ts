/**
 * Session-based authentication store.
 *
 * The password login flow stores a short-lived session token in `sessionStorage`
 * under `zolai.session`. The token is sent as `Authorization: Bearer <token>`
 * (never as `X-API-Key`). The API key in `localStorage` (`zolai.apiKey`) remains
 * the long-lived credential for API-key-based authentication.
 *
 * This module is the *only* place that reads/writes `zolai.session`. The storage
 * backend is injectable so the round-trip can be unit tested in a plain Node
 * environment (no jsdom dependency).
 */

export const SESSION_STORAGE_KEY = 'zolai.session'

export type SessionRole = 'anonymous' | 'member' | 'admin'

export type SessionPayload = {
  /** Opaque session token issued by the server. */
  token: string
  /** Unix epoch milliseconds when the token expires. */
  expiresAt: number
  /** Username the session belongs to. */
  username: string
  /** Role the server derived for this session. */
  role: SessionRole
}

/**
 * Read the server's `expires_at` into epoch milliseconds.
 *
 * The server sends a **naive UTC string**, `"YYYY-MM-DD HH:mm:ss"` — no `Z`, no
 * offset. Passing that straight through as if it were a number is what silently
 * broke session restore: `Date.now() >= "2026-10-12 04:36:47"` coerces to
 * `NaN`, the comparison is always false, and an expired token looks valid.
 * Anything already carrying a zone is parsed as-is.
 */
export function parseExpiresAt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const iso = raw.replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
  const ms = Date.parse(hasZone ? iso : `${iso}Z`)
  return Number.isFinite(ms) ? ms : null
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const listeners = new Set<() => void>()

let injected: StorageLike | null = null
let fallback: StorageLike | null = null

function memoryFallback(): StorageLike {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

function storage(): StorageLike {
  if (injected) return injected
  try {
    if (typeof globalThis.sessionStorage !== 'undefined') return globalThis.sessionStorage
  } catch {
    // Access to sessionStorage can throw in hardened/partitioned contexts.
  }
  fallback ??= memoryFallback()
  return fallback
}

function normalise(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

/** Get the raw session JSON string from storage. */
function getSessionRaw(): string {
  try {
    return normalise(storage().getItem(SESSION_STORAGE_KEY))
  } catch {
    return ''
  }
}

/** Parse the stored session, returning `null` if absent, expired or malformed. */
export function getSession(): SessionPayload | null {
  const raw = getSessionRaw()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SessionPayload> & { expires_at?: unknown }
    // Only the token and a real expiry are load-bearing: the token is what
    // authenticates, and the server's own `/auth/me` is the authority on role.
    // Requiring username/role here meant a payload missing them restored as
    // "anonymous" and sent no credential at all.
    const expiresAt = parseExpiresAt(parsed.expiresAt ?? parsed.expires_at)
    if (!parsed.token || expiresAt === null) return null
    if (Date.now() >= expiresAt) {
      // Expired — drop it silently.
      clearSession()
      return null
    }
    return {
      token: parsed.token,
      expiresAt,
      username: parsed.username ?? '',
      role: (parsed.role ?? 'anonymous') as SessionRole,
    }
  } catch {
    return null
  }
}

/** Whether a valid (non-expired) session exists. */
export function hasSession(): boolean {
  return getSession() !== null
}

/** Store a session payload. */
export function setSession(payload: SessionPayload): void {
  try {
    storage().setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage may be full or blocked; the in-memory value still drives this session.
  }
  notify()
}

/** Clear the stored session. */
export function clearSession(): void {
  try {
    storage().removeItem(SESSION_STORAGE_KEY)
  } catch {
    // no-op
  }
  notify()
}

/** Mask a session token for display: never reveal the full secret. */
export function maskSessionToken(value: string): string {
  const token = normalise(value)
  if (!token) return '—'
  if (token.length <= 8) return '•'.repeat(token.length)
  return `${token.slice(0, 4)}${'•'.repeat(6)}${token.slice(-4)}`
}

function notify(): void {
  for (const fn of listeners) fn()
}

/** Subscribe to session changes (used by the UI to re-render session state). */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Test seam: inject a fake storage backend, or pass `null` to restore. */
export function __setStorageForTests(store: StorageLike | null): void {
  injected = store
}