/**
 * The sign-in affordance — one pure description of "how do I sign in or out from
 * here", shared by the top bar, the sidebar footer and the `/login` page.
 *
 * The founder report was "there is no admin login on Studio yet", and the cause
 * was that sign-in was *reachable* but not *offered*: the registry marked
 * `/login` `nav: false`, so the sidebar and ⌘K both dropped it, and the only
 * entry points left were a role-gate prompt and a warn-mode banner. Landing on
 * `/` showed no affordance at all.
 *
 * So discoverability is data, and it is derived — never hand-written:
 *   - the destination comes from the registry record (`specOf('login')`), never
 *     a path literal (`routes.test.ts` fails the build on one);
 *   - the *surfaces* that expose it come from that record's own flags
 *     (`signInSurfaces`), so the palette's membership is the `palette` flag and
 *     the footer's is `minRole: 'anonymous'` — not a list written somewhere else;
 *   - the labels, tone and copy come from the role the **server** reported
 *     (`GET /auth/me`), never from the presence of a key in `localStorage`
 *     (`src/lib/auth.ts` is the only source of a role).
 *
 * Everything here is pure so it can be asserted in the plain-Node vitest
 * environment (no DOM, no jsdom): a component that stops rendering the
 * affordance is caught by a source guard in `routes.test.ts`.
 */

import { roleBadge, type Role } from './auth'
import { inPalette, pathOf, specOf, type RouteSpec } from './routes'
import type { MeAuthSource } from './schemas'

/** The identity fields the shell reads — the `/auth/me` payload, or a subset. */
export type SignInIdentity = {
  role: Role
  /** Server-side prefix of the key (a prefix, never the key), `null` if none. */
  keyPrefix?: string | null
  /** Scopes the server granted, rendered verbatim where the key's power is shown. */
  scopes?: readonly string[]
  /** Auth source the **server** reported (`anonymous` | `api_key` | `session` | `oauth`). */
  authSource?: MeAuthSource
  /** Username when a session is active. */
  username?: string | null
}

/** Normalise the prefix: the server may answer `null`, or a blank string. */
function prefixOf(identity: SignInIdentity): string | null {
  const raw = identity.keyPrefix
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Which shell surfaces expose the sign-in destination, for a given registry
 * record.
 *
 * Deliberately role-free: the answer is the same for anonymous, member and
 * admin, because a user who cannot sign in *cannot sign out* — hiding the
 * control from an identified user is how a session gets stranded.
 */
export type SignInSurfaces = {
  /** The primary top-bar control. */
  topBar: boolean
  /** The sidebar footer entry, under the nav list and its separator. */
  sidebar: boolean
  /** A ⌘K command in the palette's Navigate group. */
  palette: boolean
}

/**
 * Where the sign-in control may live, derived from the registry record.
 *
 * A record that is missing, or is no longer anonymous-safe, yields `false`
 * everywhere: gating sign-in behind a privilege is the chicken-and-egg trap the
 * registry's `minRole: 'anonymous'` exists to prevent, so the helper refuses to
 * pretend it is fine.
 */
export function signInSurfaces(spec: RouteSpec | undefined): SignInSurfaces {
  const reachable = spec !== undefined && spec.minRole === 'anonymous'
  return {
    topBar: reachable,
    sidebar: reachable,
    palette: reachable && inPalette(spec),
  }
}

/** The registry surfaces the sign-in destination actually occupies. */
export const SIGN_IN_SURFACES = signInSurfaces(specOf('login'))

/** What the sign-in control does when clicked. */
export type SignInAction = 'sign-in' | 'sign-out'

/**
 * The primary sign-in control (top bar; also the destination the sidebar and ⌘K
 * agree on). Always routes to the registry's sign-in page — that page both
 * verifies a pasted key and, once signed in, shows the identity and a way out.
 */
export type SignInEntry = {
  /** Registry destination; carries `?from=` via `signInPath()` at the call site. */
  to: string
  /** Visible label — "Sign in" while anonymous, else the role the server reports. */
  label: string
  /** The role the server reports, `anonymous` when no key is recognised. */
  role: Role
  /** Badge label for that role (`Anonymous` / `Member` / `Admin`). */
  roleLabel: string
  /** Server-side key prefix when one is recognised, else `null`. */
  keyPrefix: string | null
  /** `true` while no key is recognised — the amber "no key" language. */
  anonymous: boolean
  /** Tooltip / accessible name: what the click will do, and with what state. */
  title: string
  /** Registry label, reused as the accessible name for icon-only widths. */
  routeLabel: string
}

/**
 * The sign-in control for the current identity.
 *
 * A role badge appears only when the **server** recognised a key; a stored key
 * the server does not recognise reads as anonymous here, which is the honest
 * reading and the reason the top bar keeps its amber state until `/auth/me`
 * agrees.
 */
export function signInEntry(identity: SignInIdentity): SignInEntry {
  const spec = specOf('login')
  const prefix = prefixOf(identity)
  const badge = roleBadge(identity.role)
  const anonymous = identity.role === 'anonymous'
  const suffix = prefix ? ` (${prefix})` : ''
  return {
    to: pathOf('login'),
    // The visible label; the role itself is carried by `roleLabel` (the badge),
    // so the narrow icon-only width keeps a short, truthful word.
    label: anonymous ? spec.label : 'Signed in',
    role: identity.role,
    roleLabel: badge.label,
    keyPrefix: prefix,
    anonymous,
    title: anonymous
      ? 'No credential accepted — public endpoints only. Sign in with a key or an account.'
      : `Signed in as ${badge.label.toLowerCase()}${suffix}. Open sign-in to replace or clear the credential.`,
    routeLabel: spec.label,
  }
}

/**
 * The sidebar footer entry.
 *
 * Anonymous → a real link to the sign-in page, styled like the top bar's amber
 * "no key" control. Identified → the role plus a **sign out** button, because the
 * one thing a signed-in user must always be able to do is drop the credential
 * they are sending.
 */
export type SignInFooterEntry = {
  /** Registry destination, or `null` when the entry signs out instead. */
  to: string | null
  label: string
  action: SignInAction
  role: Role
  /** Badge label, `null` while anonymous (there is no role to badge). */
  roleLabel: string | null
  /** Server-side key prefix when recognised, else `null`. */
  keyPrefix: string | null
  /** Tooltip / accessible name. */
  title: string
}

export function signInFooterEntry(identity: SignInIdentity): SignInFooterEntry {
  const badge = roleBadge(identity.role)
  const prefix = prefixOf(identity)
  if (identity.role === 'anonymous') {
    return {
      to: pathOf('login'),
      label: specOf('login').label,
      action: 'sign-in',
      role: 'anonymous',
      roleLabel: null,
      keyPrefix: prefix,
      title: 'Sign in with a key or an account — public endpoints only until then.',
    }
  }
  return {
    to: null,
    label: 'Sign out',
    action: 'sign-out',
    role: identity.role,
    roleLabel: badge.label,
    keyPrefix: prefix,
    title: `Signed in as ${badge.label.toLowerCase()}${prefix ? ` (${prefix})` : ''}. ${signOutConsequence(identity.authSource)}`,
  }
}

/**
 * What pressing **Sign out** actually ends, in the tooltip's own sentence.
 *
 * The credentials are not cleared by the same act: ending a session leaves the
 * `localStorage` key alone (`session.ts` says so explicitly), signing out with a
 * key removes that key, and an MCP access token is not held by this browser at
 * all. One sentence covering all three told a session user their key was going
 * away, which it is not — so the wording follows the `auth_source` the **server**
 * reported, and an unreported source gets the one sentence true either way.
 */
function signOutConsequence(source: SignInIdentity['authSource']): string {
  if (source === 'session') {
    return 'Sign out ends this session; an API key stored in this browser is left untouched.'
  }
  if (source === 'api_key') {
    return 'Sign out clears the stored key and every cached response.'
  }
  // An MCP access token is not a credential this browser can hold — `credentials.ts`
  // sends a session bearer or the stored key, never `zolai_at_*` — so no click here
  // ends it, and promising that one did would be the lie this sentence avoids.
  if (source === 'oauth') {
    return 'This identity came from an MCP access token, which Studio never stores; revoke it from the client that holds it.'
  }
  return 'Sign out ends the credential this browser is sending and clears every cached response.'
}

/** What the `/login` page says about the identity it just verified. */
export type IdentitySummary = {
  /** `false` when there is no key stored, so the page stays quiet. */
  show: boolean
  /** `ok` for a recognised key, `warn` for a stored key the server ignores. */
  tone: 'ok' | 'warn'
  title: string
  /** Role + server-side prefix, or the honest reason there is neither. */
  detail: string
  /** Scopes the server granted — verbatim, never widened by this UI. */
  scopes: readonly string[]
  /** Where the numbers come from, so the reader can check them. */
  source: string
}

/**
 * Summarise the credential this browser is holding, straight from `/auth/me`.
 *
 * Three states matter. A **session**: the page used to go silent, because the
 * only reason it had for showing anything was "there is a stored key", and a
 * signed-in account has no key — so the identity the server just accepted was
 * invisible on the page that asked for it. A **recognised key**: role, prefix,
 * scopes. And the middle one, a key **in `localStorage` while the server still
 * answers `anonymous`** — revoked, rotated, or the probe simply did not answer.
 * That is a `warn`, not a silent success, and never a claim that the key works.
 *
 * `hasKey` is the one local fact here (the server cannot report a key it does
 * not hold), and it only ever *triggers the warning* — it no longer decides
 * whether the identity shows at all.
 */
export function identitySummary(identity: SignInIdentity, hasKey: boolean): IdentitySummary {
  const badge = roleBadge(identity.role)
  const prefix = prefixOf(identity)
  const scopes = Array.isArray(identity.scopes) ? identity.scopes : []
  const keySource = 'GET /auth/me — the server derives the role from the key’s scopes.'
  if (identity.authSource === 'session') {
    const who = typeof identity.username === 'string' && identity.username.trim() !== ''
      ? identity.username.trim()
      : 'this browser'
    return {
      show: true,
      tone: 'ok',
      title: 'Signed in',
      detail: `${badge.label} · ${who} — ${badge.hint}`,
      scopes,
      source:
        'GET /auth/me — auth_source=session, so this role comes from the account, not from a key’s scopes.',
    }
  }
  if (!hasKey) {
    return { show: false, tone: 'ok', title: '', detail: '', scopes: [], source: keySource }
  }
  if (identity.role === 'anonymous') {
    return {
      show: true,
      tone: 'warn',
      title: 'Stored key not recognised',
      detail:
        prefix === null
          ? 'A key is stored in this browser, but the API reports anonymous — it may have been revoked, or the identity probe did not answer.'
          : `A key is stored (${prefix}) but the API reports anonymous — the server does not recognise it any more.`,
      scopes,
      source: keySource,
    }
  }
  return {
    show: true,
    tone: 'ok',
    title: 'Signed in',
    detail: `${badge.label}${prefix ? ` · ${prefix}` : ''} — ${badge.hint}`,
    scopes,
    source: keySource,
  }
}
