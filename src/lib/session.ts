/**
 * Key-based sign-in — the only credential the API understands.
 *
 * **There are no accounts.** `zolai-core` exposes no login route: identity *is*
 * an API key, and the server derives the role from the key's scopes. So this
 * module does the only honest thing available — *verify, then store*:
 *
 *   1. probe `GET /auth/me` with the candidate key in the header only
 *      (`apiFetch(..., { apiKey })` — nothing is persisted yet);
 *   2. require the server to actually recognise it;
 *   3. only then write it to `localStorage`.
 *
 * `/auth/me` is public and **never 401s**, so a wrong key still answers `200`
 * with `key_prefix: null` and `role: "anonymous"`. That is the honest signal we
 * branch on: a key the server does not recognise is rejected here rather than
 * stored and discovered later on a gated panel.
 *
 * Nothing in this module ever renders, logs or returns the key: the caller gets
 * a verdict plus the role the server reported.
 */

import { apiGet, isApiError } from './api'
import { endpointPath } from './endpoints'
import { clearApiKey, setApiKey } from './key'
import { queryClient } from './queryClient'
import { AuthMeSchema, parseOrThrow, type AuthMe, type Role } from './schemas'

export type { Role }

/** Why a candidate key was not accepted. */
export type VerifyFailure =
  /** The server answered, but does not recognise this key. */
  | 'rejected'
  /** The request itself failed (offline, timeout, 5xx, unreadable body). */
  | 'unreachable'
  /** The candidate was blank before we ever hit the network. */
  | 'blank'

export type VerifyResult =
  | {
      ok: true
      role: Role
      scopes: readonly string[]
      /** Server-side prefix of the key, e.g. `zolai_sk_ab12` — display only. */
      keyPrefix: string
      /** Auth mode the server reported (`warn` / `enforce` / `off`). */
      mode: string
    }
  | { ok: false; reason: VerifyFailure; message: string }

const FAILURE_COPY: Record<VerifyFailure, string> = {
  blank: 'Enter a key first — nothing was sent.',
  rejected: 'The API does not recognise that key. Check the value and try again.',
  unreachable: 'Could not reach the API to verify the key. Nothing was stored.',
}

/**
 * Ask the server who this key is.
 *
 * Never stores anything. The candidate is passed per-request so a bad paste can
 * not clobber a working key, and `verifyApiKey` returns a verdict instead of
 * throwing so a form can render the reason inline.
 */
export async function verifyApiKey(
  candidate: unknown,
  signal?: AbortSignal,
): Promise<VerifyResult> {
  const key = typeof candidate === 'string' ? candidate.trim() : ''
  if (key === '') return { ok: false, reason: 'blank', message: FAILURE_COPY.blank }

  let me: AuthMe
  try {
    me = parseOrThrow(
      AuthMeSchema,
      await apiGet<unknown>(endpointPath('identity.me'), { apiKey: key, signal }),
      'auth/me',
    )
  } catch (error) {
    // 401 (strict deployments) and every transport failure land here.
    const reason: VerifyFailure = isApiError(error) && error.status === 401 ? 'rejected' : 'unreachable'
    return { ok: false, reason, message: FAILURE_COPY[reason] }
  }

  const prefix = me.key_prefix ?? ''
  if (prefix === '') {
    // 200 + no prefix + anonymous: the route answered, the key did not.
    return { ok: false, reason: 'rejected', message: FAILURE_COPY.rejected }
  }
  if (!key.startsWith(prefix)) {
    // Defence in depth: the prefix the server echoed must match what we sent.
    return { ok: false, reason: 'rejected', message: FAILURE_COPY.rejected }
  }

  return {
    ok: true,
    role: me.role,
    scopes: me.scopes,
    keyPrefix: prefix,
    mode: me.mode,
  }
}

export type SignInResult =
  | { ok: true; role: Role; keyPrefix: string; mode: string }
  | { ok: false; reason: VerifyFailure; message: string }

/**
 * Verify a key and **only then** persist it.
 *
 * A rejected or unreachable key stores nothing, so the previous key (if any)
 * stays untouched. On success the query cache is cleared: responses fetched
 * before this key existed may have been produced without it.
 */
export async function signIn(candidate: unknown, signal?: AbortSignal): Promise<SignInResult> {
  const verified = await verifyApiKey(candidate, signal)
  if (!verified.ok) return verified
  setApiKey(String(candidate).trim())
  queryClient.clear()
  return { ok: true, role: verified.role, keyPrefix: verified.keyPrefix, mode: verified.mode }
}

/**
 * Sign out: drop the stored key and every cached response.
 *
 * There is no server session to end — the key *was* the session — so clearing
 * storage plus the cache is the complete operation.
 */
export function signOut(): void {
  clearApiKey()
  queryClient.clear()
}

/** Copy for the sign-in screen, pure so the wording is testable. */
export function signInTitle(hasStoredKey: boolean): string {
  return hasStoredKey ? 'Replace the stored API key' : 'Sign in with an API key'
}