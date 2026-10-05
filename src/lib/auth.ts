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
      parseOrThrow(AuthMeSchema, await apiGet<unknown>('/auth/me', { signal }), 'auth/me'),
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
