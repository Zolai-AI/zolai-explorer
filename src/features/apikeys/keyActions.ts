/**
 * The one rule an API-key mint has that a name-and-scopes form hides.
 *
 * `POST /admin/api-keys` is strict `apikey:manage` + admin role, and then caps
 * the *outcome*: `create` and `rotate` resolve the rank the scopes about to be
 * issued would hand the key, and refuse when that outranks the caller
 * (`403 scope_above_actor`). Rotation replays the old key's scopes, so a legacy
 * `*` key rotated by an admin is refused for the same reason it could not be
 * issued.
 *
 * A key has no account behind it, so its rank *is* its widest scope — which
 * makes the vocabulary below a copy of the server's `SUPERADMIN_SCOPES` /
 * `ADMIN_SCOPES`, and the reason this is a module rather than a string in the
 * dialog: the check needs a unit test, and the lists need one place to change.
 */

import { rankOf, type Role } from '../../lib/auth'

/** Scopes whose holder is a superadmin. `*` subsumes `role:manage`. */
export const SUPERADMIN_SCOPES: readonly string[] = ['*', 'role:manage']

/** Scopes whose holder is an admin but not a superadmin. */
export const ADMIN_SCOPES: readonly string[] = ['apikey:manage', 'settings:write', 'user:manage']

/**
 * Which rank a scope set would hand a key.
 *
 * Anything that is not in one of the two lists above cannot elevate a key: a
 * `dataset:read` key is a member's key, which is what the server's scope reading
 * returns for it. Unknown scope words are therefore treated as non-elevating and
 * the server rejects them against its own vocabulary.
 */
export function roleOfScopes(scopes: readonly string[]): Role {
  if (scopes.some((scope) => SUPERADMIN_SCOPES.includes(scope))) return 'superadmin'
  if (scopes.some((scope) => ADMIN_SCOPES.includes(scope))) return 'admin'
  return 'member'
}

/**
 * Copy for a mint the server would refuse, or `null` when this actor may issue it.
 *
 * Equal rank is allowed — an admin issues admin keys — so the test is strictly
 * *above* the caller. The sentence names both ranks and the two ways out, because
 * "403" with no idea which scope caused it sends the operator re-guessing the
 * whole list.
 */
export function mintRefusal(scopes: readonly string[], actorRole: Role): string | null {
  const target = roleOfScopes(scopes)
  if (rankOf(target) <= rankOf(actorRole)) return null
  const offending = scopes.filter((scope) => roleOfScopes([scope]) === target)
  return (
    `That key would hold ${target} power (${offending.join(', ')}), and this credential is ` +
    `${actorRole}. The server refuses a mint wider than its caller (403 \`scope_above_actor\`), so ` +
    `nothing was issued — drop ${offending.join(' / ')} and issue it at your own rank, or have a ` +
    'superadmin mint it.'
  )
}
