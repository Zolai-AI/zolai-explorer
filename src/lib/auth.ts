/**
 * Role model for the Studio UI — one honest question: *who does the server
 * say I am?*
 *
 * The role is **never guessed from the stored key**. `useRole()` re-queries
 * `GET /auth/me` (public, never 401) whenever the stored key changes and
 * falls back to `anonymous` — on a missing key, a failed probe, or a payload
 * the tolerant schema cannot read. The server derives the role from the key's
 * scopes; this module only renders and ranks what it answers.
 *
 * The ranking helpers (`rankOf` / `can` / `roleBadge`) are pure so the gating
 * rules are unit-tested in the plain-Node vitest environment.
 */

import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'
import { endpointPath } from './endpoints'
import { getApiKey, subscribeApiKey } from './key'
import { AuthMeSchema, parseOrThrow, type AuthMe, type Role } from './schemas'

export type { AuthMe, Role }

/** Least → greatest privilege, mirroring `zolai.api.rbac.ROLES`. */
export const ROLES: readonly Role[] = ['anonymous', 'member', 'admin']

const RANK: Record<Role, number> = { anonymous: 0, member: 1, admin: 2 }

/** Numeric privilege of a role (0 = anonymous, 2 = admin). */
export function rankOf(role: Role): number {
  return RANK[role] ?? RANK.anonymous
}

/** Whether `role` meets the `minimum` privilege (unknown roles never pass). */
export function can(role: Role, minimum: Role): boolean {
  return rankOf(role) >= RANK[minimum]
}

export type RoleBadge = {
  /** Short text for the badge itself. */
  label: string
  /** One line explaining what the role can do here. */
  hint: string
  /** Badge variant name understood by the shadcn `<Badge>`. */
  variant: 'default' | 'secondary' | 'outline'
}

/** Display copy for a role — pure so the wording is testable. */
export function roleBadge(role: Role): RoleBadge {
  switch (role) {
    case 'admin':
      return {
        label: 'Admin',
        hint: 'Full access: provider settings, admin assistant, agent runs.',
        variant: 'default',
      }
    case 'member':
      return {
        label: 'Member',
        hint: 'Key-backed access: agent runs and the public assistant.',
        variant: 'secondary',
      }
    default:
      return {
        label: 'Anonymous',
        hint: 'No API key: public reads and the public assistant only.',
        variant: 'outline',
      }
  }
}

/* ------------------------------------------------------- auth-mode notice */

export type AuthModeNotice = {
  /** `false` when there is nothing to say (enforce, off, or no answer yet). */
  show: boolean
  tone: 'warn' | 'ok'
  title: string
  body: string
  /** Label for the call to action, `null` when there is nothing to do. */
  cta: string | null
}

/**
 * What the shell says about the server's auth mode, from `GET /auth/me`'s `mode`.
 *
 * - `warn` — the API still accepts unauthenticated requests and *may* flip to
 *   `enforce`. That is the one state where the UI should nag, because nothing
 *   is broken yet and a key takes seconds to add.
 * - `enforce` — a key is already required; the 401s on gated panels say it.
 * - `off` — authentication is disabled deployment-wide; nothing to prepare for.
 * - `''` (unknown, older server, offline) — say nothing rather than guess.
 *
 * Pure, so the wording is unit tested and cannot drift from the banner.
 */
export function authModeNotice(mode: string, role: Role): AuthModeNotice {
  if (mode.trim().toLowerCase() !== 'warn') {
    return { show: false, tone: 'ok', title: '', body: '', cta: null }
  }
  const who = role === 'anonymous' ? 'You are anonymous right now.' : `You are signed in as ${role}.`
  return {
    show: true,
    tone: 'warn',
    title: 'Authentication: warn mode',
    body:
      'The API accepts unauthenticated requests today, but it can flip to enforce at any time. ' +
      `${who} Add a key now so nothing breaks when it does.`,
    cta: 'Sign in…',
  }
}

/* ------------------------------------------------------- reactive identity */

/**
 * Bumped on every stored-key change so `useRole()` refetches `/auth/me`.
 * Increment happens *before* subscribers are notified, which is what makes
 * the `useSyncExternalStore` snapshot change. Seeded from the stored key so
 * a key present before this module loaded still counts as "identified".
 */
let generation = getApiKey() ? 1 : 0

function subscribeRoleChange(listener: () => void): () => void {
  return subscribeApiKey(() => {
    generation += 1
    listener()
  })
}

function keyGenerationSnapshot(): number {
  return generation
}

function serverSnapshot(): number {
  return 0
}

/**
 * Who am I, as the server sees it. Refetches on every stored-key change;
 * any failure (offline, older server without the route, malformed body)
 * reads as `anonymous` — the gate then *withholds* the UI instead of
 * guessing privileges.
 */
export function useAuthMe(): AuthMe {
  const keyGen = useSyncExternalStore(subscribeRoleChange, keyGenerationSnapshot, serverSnapshot)
  const query = useQuery({
    queryKey: ['auth', 'me', keyGen],
    queryFn: async ({ signal }): Promise<AuthMe> =>
      parseOrThrow(AuthMeSchema, await apiGet<unknown>(endpointPath('identity.me'), { signal }), 'auth/me'),
    staleTime: 30_000,
    // Identity is a gate, not a dashboard: one probe, no retry storm.
    retry: false,
  })
  // No answer yet, or an unreadable one → least-privileged reading.
  return query.data ?? { role: 'anonymous', key_prefix: null, scopes: [], mode: '' }
}

/** Reactive role only — `useAuthMe()` when the payload itself is needed. */
export function useRole(): Role {
  return useAuthMe().role
}
