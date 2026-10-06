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

/** The identity fields the shell reads — the `/auth/me` payload, or a subset. */
export type SignInIdentity = {
  role: Role
  /** Server-side prefix of the key (a prefix, never the key), `null` if none. */
  keyPrefix?: string | null
  /** Scopes the server granted, rendered verbatim where the key's power is shown. */
  scopes?: readonly string[]
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
      ? 'No API key recognised — public endpoints only. Sign in with a key.'
      : `Signed in as ${badge.label.toLowerCase()}${suffix}. Open sign-in to replace or clear the key.`,
    routeLabel: spec.label,
  }
}

/**
 * The sidebar footer entry.
 *
 * Anonymous → a real link to the sign-in page, styled like the top bar's amber
 * "no key" control. Identified → the role plus a **sign out** button, because the
 * one thing a signed-in user must always be able to do is drop the key.
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
      title: 'Sign in with an API key — public endpoints only until then.',
    }
  }
  return {
    to: null,
    label: 'Sign out',
    action: 'sign-out',
    role: identity.role,
    roleLabel: badge.label,
    keyPrefix: prefix,
    title: `Signed in as ${badge.label.toLowerCase()}${prefix ? ` (${prefix})` : ''}. Sign out clears the stored key and every cached response.`,
  }
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
 * Summarise a stored identity for the `/login` page, straight from `/auth/me`.
 *
 * The interesting case is the middle one: a key **is** in `localStorage` while the
 * server still answers `anonymous` — revoked, rotated, or the probe simply did
 * not answer. That is a `warn`, not a silent success, and never a claim that the
 * key works.
 */
export function identitySummary(identity: SignInIdentity, hasKey: boolean): IdentitySummary {
  const badge = roleBadge(identity.role)
  const prefix = prefixOf(identity)
  const source = 'GET /auth/me — the server derives the role from the key’s scopes.'
  if (!hasKey) {
    return { show: false, tone: 'ok', title: '', detail: '', scopes: [], source }
  }
  const scopes = Array.isArray(identity.scopes) ? identity.scopes : []
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
      source,
    }
  }
  return {
    show: true,
    tone: 'ok',
    title: 'Signed in',
    detail: `${badge.label}${prefix ? ` · ${prefix}` : ''} — ${badge.hint}`,
    scopes,
    source,
  }
}
