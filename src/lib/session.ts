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

/** Why a candidate credential was not accepted. */
export type VerifyFailure =
  /** The server answered, but does not recognise this credential. */
  | 'rejected'
  /** The request itself failed (offline, timeout, 5xx, unreadable body). */
  | 'unreachable'
  /** The candidate was blank before we ever hit the network. */
  | 'blank'
  /** Too many attempts — the server responded 429. */
  | 'rate_limited'

const FAILURE_COPY: Record<VerifyFailure, string> = {
  blank: 'Enter a key first — nothing was sent.',
  rejected: 'The API does not recognise that key. Check the value and try again.',
  unreachable: 'Could not reach the API to verify the key. Nothing was stored.',
  rate_limited: 'Too many attempts. Wait a moment and try again.',
}

/** The one-line reason shown beside the key field. Pure so the wording is testable. */
export function verifyFailureMessage(reason: VerifyFailure): string {
  return FAILURE_COPY[reason]
}

/**
 * How a failed verification is reported, per failure mode.
 *
 * The two failure modes are genuinely different problems and must not collapse
 * into one "login failed" string:
 *   - `rejected` — the API answered and refused the key. The fix is a different
 *     key; retrying, or blaming the network, is wrong.
 *   - `unreachable` — nothing answered at all: offline, a CORS preflight that did
 *     not come back, or a Cloudflare bot challenge in front of the API host. The
 *     key may be perfectly good, so it is *not* discarded as wrong — but it is
 *     also not stored, because nothing vouched for it.
 *
 * `stored: false` is stated in the body of both, because "nothing was stored" is
 * the fact a user most needs after a failure.
 */
export type VerifyFailureNotice = {
  /** `error` for a refused key, `warn` for an unanswered probe. */
  tone: 'error' | 'warn'
  title: string
  body: string
  /** The field-level one-liner from `verifyFailureMessage`. */
  message: string
}

const FAILURE_NOTICE: Record<VerifyFailure, { tone: VerifyFailureNotice['tone']; title: string; body: string }> = {
  blank: {
    tone: 'error',
    title: 'Nothing to verify',
    body: 'No key was entered, so no request was made and nothing was stored.',
  },
  rejected: {
    tone: 'error',
    title: 'Key rejected',
    body:
      'The API answered and does not recognise this key, so nothing was stored — a key the server refuses is never kept. Check the value for a stray character or a truncated paste, or ask an admin for a fresh key.',
  },
  unreachable: {
    tone: 'warn',
    title: 'API unreachable — key not verified',
    body:
      'No answer came back from the API, so nothing was stored. That is a transport problem (offline, a blocked CORS preflight, or a bot challenge in front of the API host), not a verdict on the key: retry once the API answers, and keep the key until then.',
  },
  rate_limited: {
    tone: 'warn',
    title: 'Rate limited — try again shortly',
    body:
      'The API responded 429 (too many requests). This is a temporary limit, not a verdict on the credential. Wait a moment and retry — nothing was stored.',
  },
}

export function verifyFailureNotice(reason: VerifyFailure): VerifyFailureNotice {
  const notice = FAILURE_NOTICE[reason]
  return { ...notice, message: FAILURE_COPY[reason] }
}

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
  if (key === '') return { ok: false, reason: 'blank', message: verifyFailureMessage('blank') }

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
    return { ok: false, reason, message: verifyFailureMessage(reason) }
  }

  const prefix = me.key_prefix ?? ''
  if (prefix === '') {
    // 200 + no prefix + anonymous: the route answered, the key did not.
    return { ok: false, reason: 'rejected', message: verifyFailureMessage('rejected') }
  }
  if (!key.startsWith(prefix)) {
    // Defence in depth: the prefix the server echoed must match what we sent.
    return { ok: false, reason: 'rejected', message: verifyFailureMessage('rejected') }
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
  | {
      ok: true
      role: Role
      keyPrefix: string
      mode: string
      authSource: 'api-key'
      username: string | null
    }
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
  return { ok: true, role: verified.role, keyPrefix: verified.keyPrefix, mode: verified.mode, authSource: 'api-key', username: null }
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

/* ------------------------------------------------------------------ password */

import { apiPost } from './api'
import { clearSession, setSession } from './sessionAuth'

/** Why a password sign-in was not accepted. */
export type PasswordVerifyFailure =
  /** The server answered 401 — bad username or password. */
  | 'rejected'
  /** The request itself failed (offline, timeout, 5xx, unreadable body). */
  | 'unreachable'
  /** The candidate was blank before we ever hit the network. */
  | 'blank'
  /** Too many attempts — the server responded 429. */
  | 'rate_limited'

const PASSWORD_FAILURE_COPY: Record<PasswordVerifyFailure, string> = {
  blank: 'Enter both username and password — nothing was sent.',
  rejected: 'Invalid username or password.',
  unreachable: 'Could not reach the API to verify the credentials. Nothing was stored.',
  rate_limited: 'Too many attempts. Wait a moment and try again.',
}

export type PasswordVerifyNotice = {
  tone: 'error' | 'warn'
  title: string
  body: string
  message: string
}

const PASSWORD_FAILURE_NOTICE: Record<PasswordVerifyFailure, { tone: PasswordVerifyNotice['tone']; title: string; body: string }> = {
  blank: {
    tone: 'error',
    title: 'Nothing to verify',
    body: 'Username and/or password were missing, so no request was made and nothing was stored.',
  },
  rejected: {
    tone: 'error',
    title: 'Invalid credentials',
    body: 'The API answered 401 — the username or password is incorrect. Nothing was stored.',
  },
  unreachable: {
    tone: 'warn',
    title: 'API unreachable — credentials not verified',
    body:
      'No answer came back from the API, so nothing was stored. That is a transport problem (offline, a blocked CORS preflight, or a bot challenge in front of the API host), not a verdict on the credentials: retry once the API answers.',
  },
  rate_limited: {
    tone: 'warn',
    title: 'Rate limited — try again shortly',
    body:
      'The API responded 429 (too many requests). This is a temporary limit, not a verdict on the credentials. Wait a moment and retry — nothing was stored.',
  },
}

export function passwordVerifyFailureMessage(reason: PasswordVerifyFailure): string {
  return PASSWORD_FAILURE_COPY[reason]
}

export function passwordVerifyFailureNotice(reason: PasswordVerifyFailure): PasswordVerifyNotice {
  const notice = PASSWORD_FAILURE_NOTICE[reason]
  return { ...notice, message: PASSWORD_FAILURE_COPY[reason] }
}

export type PasswordSignInResult =
  | { ok: true; username: string; role: 'anonymous' | 'member' | 'admin'; expiresAt: number; authSource: 'session' }
  | { ok: false; reason: PasswordVerifyFailure; message: string }

/**
 * Sign in with username and password.
 *
 * Calls `POST /auth/login` with `{ username, password }`. On success (200),
 * stores the session token in `sessionStorage` (zolai.session), **clears any
 * stored API key** (one active credential), clears the query cache, and
 * returns the session info. On failure, stores nothing and returns a verdict
 * the form can render inline.
 */
export async function signInWithPassword(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<PasswordSignInResult> {
  const user = username.trim()
  const pass = password.trim()
  if (!user || !pass) {
    return { ok: false, reason: 'blank', message: passwordVerifyFailureMessage('blank') }
  }

  let response: { token: string; expires_at: number; username: string; role: 'anonymous' | 'member' | 'admin' }
  try {
    response = await apiPost<{
      token: string
      expires_at: number
      username: string
      role: 'anonymous' | 'member' | 'admin'
    }>(endpointPath('identity.login'), { username: user, password: pass }, { signal })
  } catch (error) {
    // Map status codes to failure reasons.
    let reason: PasswordVerifyFailure = 'unreachable'
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status: number }).status
      if (status === 401) reason = 'rejected'
      else if (status === 429) reason = 'rate_limited'
    }
    return { ok: false, reason, message: passwordVerifyFailureMessage(reason) }
  }

  // Success: store session, clear API key (one active credential), clear cache.
  setSession({
    token: response.token,
    expiresAt: response.expires_at,
    username: response.username,
    role: response.role,
  })
  clearApiKey()
  queryClient.clear()

  return {
    ok: true,
    username: response.username,
    role: response.role,
    expiresAt: response.expires_at,
    authSource: 'session',
  }
}

/**
 * Sign out the current session.
 *
 * Best-effort call to `POST /auth/logout` (ignores failures), then clears the
 * local session and the query cache. The API key in localStorage is **not**
 * touched — the user can still have a long-lived key alongside a session.
 */
export async function signOutSession(signal?: AbortSignal): Promise<void> {
  try {
    await apiPost(endpointPath('identity.logout'), {}, { signal })
  } catch {
    // Best-effort: the server may not have a session to invalidate, or the
    // request may fail. We still clear local state.
  }
  clearSession()
  queryClient.clear()
}

/** Copy for the sign-in screen, pure so the wording is testable. */
export function signInTitle(hasStoredKey: boolean): string {
  return hasStoredKey ? 'Replace the stored API key' : 'Sign in with an API key'
}