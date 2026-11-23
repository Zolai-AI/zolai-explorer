/**
 * Account writes: which one a click means, and whether it needs a confirm step.
 *
 * Two halves, and they are not the same guarantee. Measured against the deployed
 * contract (`zolai-core/zolai/api/session_auth.py`):
 *
 * **The server protects the *system*.** The guards live in the one writer, not in
 * a decorator, so no route can skip them:
 *   - only a superadmin moves a role at all, and an actor below superadmin cannot
 *     touch an admin-or-above account;
 *   - nobody moves their **own** role;
 *   - the last enabled superadmin is neither demoted nor disabled — that is the
 *     state from which no HTTP route can hand a role out again.
 * Each refusal is a 403 (409 for the last superadmin) naming its reason, never a
 * silent no-op.
 *
 * **This copy protects the *caller***, which the server cannot do for them:
 *   - `set_user_role` rewrites the row and calls `reset_session_cache()`, so a
 *     demotion applies on the very next request — `GET /auth/me` answers `member`,
 *     `RequireRole` renders the prompt, and the panel that made the change is gone
 *     from this browser with no way back *from this browser*;
 *   - `set_user_enabled` revokes **every live session of the target** in the same
 *     transaction when disabling — including the caller's own when the two
 *     accounts are the same;
 *   - `change_password` revokes every live session of the target, so an admin who
 *     changes their *own* password is signed out by their own request.
 *
 * So this module is a warning layer over guards that are real, and it is pure for
 * the same reason `lib/agentErrors.ts` is: the branching *is* the message, and
 * untested branching is how "Disable" ends up reading like a toggle.
 */

import { rankOf } from '../../lib/auth'
import type { UserRole } from './api'

/** The five writes this panel can make to one account. */
export type AccountAction = 'enable' | 'disable' | 'promote' | 'demote' | 'revoke-sessions'

/** Does a role reach the admin surfaces? (`minRole: 'admin'` gates them, and superadmin clears that.) */
export function isAdminOrAbove(role: UserRole): boolean {
  return rankOf(role) >= rankOf('admin')
}

/** What a confirm title calls the role an account is being moved to. */
const ROLE_ARTICLE: Record<UserRole, string> = {
  member: 'a member',
  admin: 'an admin',
  superadmin: 'a superadmin',
}

/** Copy for a confirm step — a destructive write is never one click. */
export type AccountConfirmation = {
  title: string
  body: string
  confirmLabel: string
  /** Paints the confirm action red. `false` is a plain confirm (still not silent). */
  destructive: boolean
}

/** The account fields the decision needs — a whole `AdminUser` also satisfies it. */
export type AccountRef = {
  username: string
  role: UserRole
  enabled: boolean
}

/**
 * The account the server says this browser is signed in as.
 *
 * `me` comes from `GET /auth/me`, which reports a username **only for a session**
 * credential — for an API key it is `null`, because the server cannot map a key
 * to an account. A `null` therefore means "unknown", and no row is ever labelled
 * as you on the strength of a guess.
 */
export function isSelf(account: { username: string }, me: string | null | undefined): boolean {
  return typeof me === 'string' && me !== '' && account.username === me
}

/**
 * How many accounts can still open the admin surfaces — the number that matters
 * before anything removes admin capability.
 *
 * Counts **enabled** accounts at `admin` *or above*, because a disabled account
 * cannot sign in and a superadmin reaches the admin routes too. It reads the
 * whole list, which is honest here: `GET /admin/users` is unpaginated
 * (`endpoints.ts` records `limit: 'none'`), so this is a real total and not a
 * page pretending to be one.
 */
export function enabledAdminCount(
  users: readonly Pick<AccountRef, 'role' | 'enabled'>[],
): number {
  return users.filter((user) => user.enabled && isAdminOrAbove(user.role)).length
}

/**
 * How many accounts can still **grant a role** — the number behind every
 * "can this be undone?" question.
 *
 * `role:manage` is what moves a role, and no HTTP route can create the first
 * superadmin (the bootstrap is CLI-only by design). So when this is `0`, a
 * demotion has no undo anywhere over HTTP: the sentence the panel prints has to
 * name `zolai user set-role` on the server, because nothing else puts the role
 * back.
 */
export function enabledSuperadminCount(
  users: readonly Pick<AccountRef, 'role' | 'enabled'>[],
): number {
  return users.filter((user) => user.enabled && user.role === 'superadmin').length
}

/** Which write a click on the enable/disable control means. */
export function toggleAction(user: { enabled: boolean }): AccountAction {
  return user.enabled ? 'disable' : 'enable'
}

/**
 * Which write picking a role in the select means — the **direction**, not the
 * word "admin".
 *
 * Three stored roles make two promotions and two demotions, so comparing the
 * two roles is the only correct rule: `member → admin` and `admin → superadmin`
 * both promote, and `superadmin → admin` is a demotion even though the account
 * keeps reaching every admin route.
 */
export function roleAction(from: UserRole, to: UserRole): AccountAction {
  return rankOf(to) > rankOf(from) ? 'promote' : 'demote'
}

/**
 * Which optional fields a `POST /admin/users` body may carry from this actor.
 *
 * The password and username are the caller's own business and stay out of here;
 * what this decides is the two fields whose presence changes the answer:
 *
 *   - `role` — the route tests `role != "member"` against the **caller's** rank
 *     *before* it inserts (`403 role_change_requires_superadmin`), so an admin who
 *     sends `role: "admin"` gets an error and no account. Omitting it is not
 *     tidiness: the server defaults an absent role to `member`, which is the one
 *     rank every actor here is allowed to create.
 *   - `display_name` — optional and blank-means-absent, so an empty string is
 *     never shipped as a name.
 */
export function createAccountFields(input: {
  displayName: string
  role: UserRole
  actorIsSuperadmin: boolean
}): { display_name?: string; role?: UserRole } {
  const name = input.displayName.trim()
  return {
    ...(name ? { display_name: name } : {}),
    ...(input.actorIsSuperadmin ? { role: input.role } : {}),
  }
}

/**
 * True when a password change ends the caller's **own** browser session.
 *
 * `authSource` has to be `session`: the server revokes every live session of the
 * target account, and a password session is one of those — but an API key is
 * *not* a session, so a key-backed admin who changes their own account's
 * password stays signed in and must not be told otherwise.
 */
export function endsOwnSession(input: {
  targetUsername: string
  me: string | null | undefined
  authSource: string
}): boolean {
  return (
    input.authSource === 'session' &&
    isSelf({ username: input.targetUsername }, input.me)
  )
}

/**
 * Copy for the confirm step, or `null` when the write needs none.
 *
 * `enable` and someone else's promotion as far as `admin` return `null`
 * deliberately: they *widen* access, a mistake is undoable in one click, and a
 * confirm would be noise. Granting `superadmin` is confirmed anyway — it is the
 * one widening write that cannot be taken back from the person who did it,
 * because the new account can now move *your* role. Everything that narrows
 * access or drops live sessions is confirmed too, and a write the server is going
 * to **refuse** says so here — including a role change your own row cannot make,
 * which never returns `null` — because a click that leads to a 403 is a trap, not
 * a warning.
 */
export function confirmationFor(input: {
  action: AccountAction
  account: AccountRef
  isSelf: boolean
  /** Enabled accounts at admin-or-above — who can open this panel at all. */
  enabledAdmins: number
  /** Enabled superadmins — who can put a role back. */
  enabledSuperadmins: number
  /**
   * Whether the credential making the call holds `role:manage`.
   *
   * Read from `GET /auth/me` (`can(role, 'superadmin')`), never from a checkbox in
   * this row: the writer's first guard is the *caller's* role, so an admin clicking
   * on an admin account and a superadmin clicking on the same account get different
   * answers from the same route.
   */
  actorIsSuperadmin: boolean
  /** The role a role-write is moving to. Ignored by the other actions. */
  nextRole?: UserRole | null
}): AccountConfirmation | null {
  const { action, account, isSelf: self, enabledAdmins, enabledSuperadmins } = input
  const actorIsSuperadmin = input.actorIsSuperadmin
  const name = account.username
  const next = input.nextRole ?? null

  // ── what the server's writer will answer, before anything about consequences.
  // Each arm is the writer's own guard, read off `session_auth`, in the order that
  // writer checks them — a refusal is not a warning you can click through, it is a
  // 403/409 and nothing changes.
  const refusesAdminTarget =
    !actorIsSuperadmin && (action === 'enable' || action === 'disable') && isAdminOrAbove(account.role)
  const refusesRoleWrite = !actorIsSuperadmin && (action === 'promote' || action === 'demote')
  if (action === 'enable' && !refusesAdminTarget) return null
  // A promotion as far as `admin` widens access and is one click to undo. Your
  // *own* promotion, and any promotion by a caller who cannot grant roles, are the
  // exceptions: the writer refuses them, and a silent click that ends in a 403 is
  // the same trap the confirm step exists to avoid.
  if (action === 'promote' && !refusesRoleWrite && !self && next !== 'superadmin') return null

  const refused: string | null =
    // `set_user_enabled` / `set_user_role` both test the **caller** first.
    refusesAdminTarget
      ? `Only superadmin may change the enabled state of an admin-or-above account, in either direction (403 \`target_requires_superadmin\`) — \`user:manage\` enables and disables members.`
      : refusesRoleWrite
        ? 'Only a superadmin can move a role at all (403 `role_change_requires_superadmin`) — another superadmin has to make this change.'
        : (action === 'promote' || action === 'demote') && self
          ? 'A role change cannot be decided by the account it applies to, in either direction (403 `self_role_change`) — another superadmin has to make it.'
          : action === 'disable' && self
            ? 'An account cannot disable itself (403 `self_disable`).'
            : (action === 'demote' || action === 'disable') &&
                account.role === 'superadmin' &&
                // Only an *enabled* superadmin is an operator — the writer counts
                // those, and demoting a disabled one stays possible.
                account.enabled &&
                enabledSuperadmins <= 1
              ? 'That account is the only enabled superadmin, so the server refuses to remove it (409 `last_superadmin`) — promote a second one first.'
              : null

  // Does this write take the account below the rank it holds now, in a way that
  // costs it (or us) the admin surface? A demotion that states no target is the
  // writer's own default — the row goes to `member` — so the copy must not fall
  // through to the keep-the-admin-routes sentence.
  const toMember = action === 'demote' && (next ?? 'member') === 'member'
  const losesAdminSurface =
    (action === 'disable' && isAdminOrAbove(account.role)) ||
    (action === 'demote' && isAdminOrAbove(account.role) && toMember)
  // Only an *enabled* row is one of the accounts `enabledAdminCount` counts, so a
  // disabled target removing itself from that set changes nothing about who can
  // sign in — the warning would be about a number that was already reached.
  const lastAdmin = losesAdminSurface && account.enabled && enabledAdmins <= 1
  // A demotion inside the admin-and-above band (superadmin → admin) keeps the
  // admin routes but drops role:manage, so the thin-margin note is asked of the
  // superadmin count instead of the admin count.
  const losesRoleManage =
    action === 'demote' && account.role === 'superadmin' && next !== 'superadmin'

  const body: string[] = []
  let title: string
  let confirmLabel: string
  // A write the server refuses is never painted red: nothing is being destroyed.
  let destructive = refused === null

  if (action === 'promote') {
    // Named from the pick, not hardcoded: with three stored roles a promotion is
    // either "to admin" or "to superadmin", and the confirm must say which.
    const targetRole = next ?? 'superadmin'
    title = `Make ${name} ${ROLE_ARTICLE[targetRole]}?`
    // "Grant", not "Change": this button hands out the power to change roles.
    confirmLabel = targetRole === 'superadmin' ? 'Grant superadmin' : `Change to ${targetRole}`
    body.push(
      targetRole === 'superadmin'
        ? `${name} gains role:manage — the power to change any account's role, including the account you are signed in as, and to decide the role-request queue.`
        : `${name} gains the admin surfaces: provider settings, the admin assistant, and this panel.`,
    )
  } else if (action === 'disable') {
    title = `Disable ${name}?`
    confirmLabel = 'Disable account'
    body.push(
      `${name} cannot sign in again, and the server revokes every live session of that account in the same request.`,
    )
    // No "this is your own account" sentence: `self_disable` is a refusal, and it
    // is already the first sentence of this body.
  } else if (action === 'demote') {
    const targetRole = next ?? 'member'
    title = `Make ${name} ${ROLE_ARTICLE[targetRole]}?`
    confirmLabel = `Change to ${targetRole}`
    body.push(
      toMember
        ? `The role is read from the account row on every request, so ${name} loses the admin routes on their next one.`
        : `${name} keeps the admin routes but loses role:manage: no role changes, and no decisions in the request queue.`,
    )
    // No "this is your own account" sentence: `self_role_change` is a refusal, and
    // it is already the first sentence of this body.
  } else {
    title = `Sign ${name} out everywhere?`
    confirmLabel = 'Revoke sessions'
    // Not red: it forces a fresh login, it does not remove the account's access.
    destructive = false
    body.push(
      `Every live session for ${name} is revoked in one request. A count comes back, never a token.`,
    )
    if (self) body.push('That includes the session in this browser.')
  }

  if (refused !== null) {
    // The consequence copy above stays — it is what the caller asked about — but
    // the refusal is what they will actually get, so it comes first.
    body.unshift(refused)
  } else if (losesRoleManage) {
    // The row being demoted is only counted in `enabledSuperadmins` when it is
    // enabled; a disabled superadmin is already outside that number, so
    // subtracting it would report one operator fewer than survives.
    const remaining = account.enabled
      ? Math.max(0, enabledSuperadmins - 1)
      : enabledSuperadmins
    body.push(
      remaining === 0
        ? 'That leaves no enabled superadmin, so nothing over HTTP can hand a role out again — `zolai user set-role` on the server is the only way back.'
        : remaining === 1
          ? 'That leaves 1 enabled superadmin who can change a role. The server refuses to remove the last one, so this is the margin: keep a second.'
          : `That leaves ${remaining} enabled superadmins who can change a role.`,
    )
  } else if (lastAdmin) {
    // `enabledAdmins <= 1` with an *enabled* admin-or-above target means this row
    // is the one. A target that was a superadmin is already answered above — the
    // writer refuses to remove the last enabled one — so nothing left in this
    // browser holds role:manage and only the server CLI puts an account back.
    // Promising a permanent lock-out would be the old copy's lie, written before
    // the writer had any guards.
    body.push(
      'That is the only enabled account reaching the admin surfaces, so nothing in this browser could undo it. On the server it is `zolai user enable` and `zolai user set-role`.',
    )
  }

  return { title, body: body.join(' '), confirmLabel, destructive }
}
