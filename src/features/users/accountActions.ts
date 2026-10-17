/**
 * Account writes: which one a click means, and whether it needs a confirm step.
 *
 * Nothing in `zolai-core` protects the *caller* here. Measured against the
 * deployed contract (`zolai-core/zolai/api/session_auth.py`):
 *
 *   - `set_user_role` (`:604`) rewrites the row and calls `reset_session_cache()`,
 *     so a demotion applies on the very next request — `GET /auth/me` answers
 *     `member`, `RequireRole` renders the prompt, and the panel that made the
 *     change is gone from this browser with no way back;
 *   - `set_user_enabled` (`:562`) revokes **every live session of the target** in
 *     the same transaction when disabling — including the caller's own when the
 *     two accounts are the same;
 *   - `change_password` (`:646`) revokes every live session of the target, so an
 *     admin who changes their *own* password is signed out by their own request.
 *
 * So this copy is the only guard, and it lives here as pure functions for the
 * same reason `lib/agentErrors.ts` does: the branching *is* the message, and
 * untested branching is how "Disable" ends up reading like a toggle.
 */

import type { UserRole } from './api'

/** The five writes this panel can make to one account. */
export type AccountAction = 'enable' | 'disable' | 'promote' | 'demote' | 'revoke-sessions'

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
 * How many accounts can actually sign in as an admin — the number that matters
 * before anything removes admin capability.
 *
 * Counts **enabled** admins, because a disabled admin cannot sign in. It reads
 * the whole list, which is honest here: `GET /admin/users` is unpaginated
 * (`endpoints.ts` records `limit: 'none'`), so this is a real total and not a
 * page pretending to be one.
 */
export function enabledAdminCount(users: readonly Pick<AccountRef, 'role' | 'enabled'>[]): number {
  return users.filter((user) => user.enabled && user.role === 'admin').length
}

/** Which write a click on the enable/disable control means. */
export function toggleAction(user: { enabled: boolean }): AccountAction {
  return user.enabled ? 'disable' : 'enable'
}

/** Which write picking a role in the select means. */
export function roleAction(next: UserRole): AccountAction {
  return next === 'admin' ? 'promote' : 'demote'
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
 * `enable` and `promote` return `null` deliberately: both *widen* access, a
 * mistake is undoable in one click, and a confirm would be noise. Everything
 * that narrows access or drops somebody's live sessions is confirmed, because
 * the server will not stop the caller and one of those cannot be undone from
 * this UI at all.
 */
export function confirmationFor(input: {
  action: AccountAction
  account: AccountRef
  isSelf: boolean
  enabledAdmins: number
}): AccountConfirmation | null {
  const { action, account, isSelf: self, enabledAdmins } = input
  const name = account.username

  if (action === 'enable' || action === 'promote') return null

  // Only these two can remove the last way back into this panel.
  const removesAnAdmin = action === 'demote' || (action === 'disable' && account.role === 'admin')
  const lastAdmin = removesAnAdmin && enabledAdmins <= 1

  const body: string[] = []
  let title: string
  let confirmLabel: string
  let destructive: boolean

  if (action === 'disable') {
    title = `Disable ${name}?`
    confirmLabel = 'Disable account'
    destructive = true
    body.push(
      `${name} cannot sign in again, and the server revokes every live session of that account in the same request.`,
    )
    if (self) {
      body.push('That is the account you are signed in as, so this browser is signed out immediately.')
    }
  } else if (action === 'demote') {
    title = `Make ${name} a member?`
    confirmLabel = 'Change to member'
    destructive = true
    body.push(
      `The role is read from the account row on every request, so ${name} loses the admin routes on their next one.`,
    )
    if (self) {
      body.push(
        'That is the account you are signed in as, so this browser loses the admin surface on the next request.',
      )
    }
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

  if (lastAdmin) {
    if (action === 'demote') {
      // The way back differs per action, so the copy does too. `zolai user`
      // exposes create/list/disable/enable/password/revoke-sessions — there is
      // **no** role command, so a demoted last admin has no supported undo at
      // all.
      body.push(
        self
          ? 'This is the only account that can sign in as an admin, and nothing here can put the role back: the panel itself needs admin to open, and the CLI has no role command — a direct database change would be the only way.'
          : 'That is the only account that can sign in as an admin, and nothing here can put the role back: the CLI has no role command — a direct database change would be the only way.',
      )
    } else {
      // Disabling *is* undoable from the CLI (`zolai user enable`).
      body.push(
        self
          ? 'This is the only account that can sign in as an admin, so nothing in this browser could undo it — `zolai user enable` on the server is the only way back.'
          : 'That is the only account that can sign in as an admin — `zolai user enable` on the server is the only way back.',
      )
    }
  }

  return { title, body: body.join(' '), confirmLabel, destructive }
}
