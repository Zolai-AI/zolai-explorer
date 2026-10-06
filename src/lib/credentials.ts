/**
 * Credentials resolver — the single authority for "which auth header do I send?".
 *
 * The rule is simple and absolute: **session wins, else key, never both**.
 *
 * - If a valid `zolai.session` exists (non-expired token), send
 *   `Authorization: Bearer <token>` and **no** `X-API-Key`.
 * - Else if a `zolai.apiKey` exists in localStorage, send
 *   `X-API-Key: <key>` and **no** `Authorization`.
 * - Else send neither header (anonymous request).
 *
 * This module is the *only* place that decides the header. `apiFetch` calls
 * `resolveAuthHeader()` and applies exactly what it returns.
 */

import { getSession, type SessionPayload } from './sessionAuth'
import { getApiKey } from './key'

export type AuthHeader =
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; key: string }
  | { type: 'none' }

/** The one resolver. Pure, testable, no side effects. */
export function resolveAuthHeader(): AuthHeader {
  const session = getSession()
  if (session) {
    return { type: 'bearer', token: session.token }
  }
  const key = getApiKey()
  if (key) {
    return { type: 'api-key', key }
  }
  return { type: 'none' }
}

/** Convenience: the header name/value pair ready for `fetch`. */
export function authHeaderEntry(): [string, string] | null {
  const resolved = resolveAuthHeader()
  if (resolved.type === 'bearer') return ['Authorization', `Bearer ${resolved.token}`]
  if (resolved.type === 'api-key') return ['X-API-Key', resolved.key]
  return null
}

/** The auth source for UI display / diagnostics. */
export type AuthSource = 'session' | 'api-key' | 'none'

export function authSource(): AuthSource {
  const session = getSession()
  if (session) return 'session'
  if (getApiKey()) return 'api-key'
  return 'none'
}

/** Username when a session is active, else `null`. */
export function sessionUsername(): string | null {
  const session = getSession()
  return session?.username ?? null
}

/** Role when a session is active, else the role from the API key probe (via auth.ts). */
export function sessionRole(): SessionPayload['role'] | null {
  const session = getSession()
  return session?.role ?? null
}