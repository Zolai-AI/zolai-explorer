/**
 * The write-safety model behind the users panel.
 *
 * Two guarantees, and these specs keep them apart. The **server** protects the
 * system: `session_auth.py` refuses a self role change in either direction,
 * refuses a self disable, and refuses to remove the last enabled superadmin —
 * each a 403, or 409 for that last one, and nothing is written. **This module**
 * protects the *caller*, which no writer can do for them: it says what a
 * narrowing write costs the browser that clicked it, and it repeats the server's
 * refusal *before* the click, because a control that leads to a 403 is a trap
 * rather than a warning. The branching is the message, so an untested branch here
 * is how a destructive write becomes one silent click.
 */
import { describe, expect, it } from 'vitest'
import type { UserRole } from './api'
import {
  confirmationFor,
  createAccountFields,
  enabledAdminCount,
  enabledSuperadminCount,
  endsOwnSession,
  isAdminOrAbove,
  isSelf,
  roleAction,
  toggleAction,
  type AccountAction,
  type AccountConfirmation,
  type AccountRef,
} from './accountActions'

/** A row as `GET /admin/users` returns it (`sanitize_user`, no hash). */
function account(overrides: Partial<AccountRef> = {}): AccountRef {
  return { username: 'founder', role: 'admin', enabled: true, ...overrides }
}

/** One `confirmationFor` call, with the shared inputs pre-filled. */
function ask(input: {
  action: AccountAction
  account?: Partial<AccountRef>
  isSelf?: boolean
  enabledAdmins?: number
  enabledSuperadmins?: number
  /** Default `true`: the pre-guard-era copy assumed every caller could grant. */
  actorIsSuperadmin?: boolean
  nextRole?: UserRole | null
}): AccountConfirmation | null {
  return confirmationFor({
    action: input.action,
    account: account(input.account),
    isSelf: input.isSelf ?? false,
    enabledAdmins: input.enabledAdmins ?? 2,
    enabledSuperadmins: input.enabledSuperadmins ?? 2,
    actorIsSuperadmin: input.actorIsSuperadmin ?? true,
    nextRole: input.nextRole ?? null,
  })
}

describe('isSelf', () => {
  it('matches the username the server reported for this browser', () => {
    expect(isSelf({ username: 'founder' }, 'founder')).toBe(true)
  })

  it('never guesses from a missing identity', () => {
    // An API key cannot be mapped to an account, so `/auth/me` sends no
    // username — "unknown" must not read as "not me" or as "me".
    expect(isSelf({ username: 'founder' }, null)).toBe(false)
    expect(isSelf({ username: 'founder' }, undefined)).toBe(false)
    expect(isSelf({ username: 'founder' }, '')).toBe(false)
    expect(isSelf({ username: 'founder' }, 'someone-else')).toBe(false)
  })
})

describe('isAdminOrAbove', () => {
  it('treats superadmin as clearing the admin gate', () => {
    expect(isAdminOrAbove('admin')).toBe(true)
    expect(isAdminOrAbove('superadmin')).toBe(true)
    expect(isAdminOrAbove('member')).toBe(false)
  })
})

describe('enabledAdminCount', () => {
  it('counts only accounts that can actually sign in as an admin', () => {
    expect(
      enabledAdminCount([
        account({ username: 'a', role: 'admin', enabled: true }),
        account({ username: 'b', role: 'admin', enabled: false }),
        account({ username: 'c', role: 'member', enabled: true }),
      ]),
    ).toBe(1)
  })

  it('counts an enabled superadmin, which reaches the admin routes too', () => {
    expect(
      enabledAdminCount([
        account({ username: 'root', role: 'superadmin', enabled: true }),
        account({ username: 'slept', role: 'superadmin', enabled: false }),
      ]),
    ).toBe(1)
  })

  it('is zero for an empty list', () => {
    expect(enabledAdminCount([])).toBe(0)
  })
})

describe('enabledSuperadminCount', () => {
  it('counts only the enabled rows that can grant a role', () => {
    expect(
      enabledSuperadminCount([
        account({ username: 'root', role: 'superadmin', enabled: true }),
        account({ username: 'slept', role: 'superadmin', enabled: false }),
        account({ username: 'ops', role: 'admin', enabled: true }),
      ]),
    ).toBe(1)
  })
})

describe('toggleAction / roleAction', () => {
  it('maps the control state to the write it makes', () => {
    expect(toggleAction({ enabled: true })).toBe('disable')
    expect(toggleAction({ enabled: false })).toBe('enable')
  })

  it('maps a role pick to its direction, not to the word "admin"', () => {
    expect(roleAction('member', 'admin')).toBe('promote')
    expect(roleAction('member', 'superadmin')).toBe('promote')
    expect(roleAction('admin', 'superadmin')).toBe('promote')
    // Still a demotion although the account keeps reaching every admin route —
    // which is exactly why the compare cannot be a name check.
    expect(roleAction('superadmin', 'admin')).toBe('demote')
    expect(roleAction('superadmin', 'member')).toBe('demote')
    expect(roleAction('admin', 'member')).toBe('demote')
  })
})

describe('endsOwnSession', () => {
  it('is true only for your own account over a password session', () => {
    expect(endsOwnSession({ targetUsername: 'founder', me: 'founder', authSource: 'session' })).toBe(
      true,
    )
  })

  it('is false for another account', () => {
    expect(
      endsOwnSession({ targetUsername: 'newbie', me: 'founder', authSource: 'session' }),
    ).toBe(false)
  })

  it('is false for an API key — a key is not a session, so nothing of ours is revoked', () => {
    expect(
      endsOwnSession({ targetUsername: 'founder', me: 'founder', authSource: 'api_key' }),
    ).toBe(false)
  })

  it('is false for an OAuth token, which Studio never holds', () => {
    expect(
      endsOwnSession({ targetUsername: 'founder', me: 'founder', authSource: 'oauth' }),
    ).toBe(false)
  })

  it('is false when the server reported no identity', () => {
    expect(
      endsOwnSession({ targetUsername: 'founder', me: null, authSource: 'anonymous' }),
    ).toBe(false)
  })
})

describe('confirmationFor — writes that need no confirm', () => {
  it('lets the reversible widenings through', () => {
    expect(ask({ action: 'enable' })).toBeNull()
    expect(ask({ action: 'promote', nextRole: 'admin' })).toBeNull()
    expect(ask({ action: 'promote', account: { role: 'member' }, nextRole: 'admin' })).toBeNull()
  })

  it('confirms a superadmin grant — the new account can move this one', () => {
    const c = ask({ action: 'promote', account: { role: 'admin' }, nextRole: 'superadmin' })

    expect(c?.title).toBe('Make founder a superadmin?')
    expect(c?.confirmLabel).toBe('Grant superadmin')
    expect(c?.destructive).toBe(true)
    expect(c?.body).toMatch(/gains role:manage/)
    expect(c?.body).toMatch(/the account you are signed in as/)
    expect(c?.body).toMatch(/request queue/)
  })
})

describe("confirmationFor — the writer's refusals, said before the click", () => {
  it('refuses a self disable instead of confirming it', () => {
    const c = ask({ action: 'disable', isSelf: true })

    expect(c?.body).toMatch(/^An account cannot disable itself \(403 `self_disable`\)/)
    expect(c?.destructive).toBe(false)
    // Nothing is being destroyed, so a self-consequence sentence has no place in
    // a body the server will not act on.
    expect(c?.body).not.toMatch(/signed out immediately/)
  })

  it('refuses a role change on your own row, in either direction', () => {
    const demote = ask({ action: 'demote', isSelf: true, nextRole: 'member' })
    const promote = ask({
      action: 'promote',
      account: { role: 'admin' },
      isSelf: true,
      nextRole: 'superadmin',
    })

    for (const c of [demote, promote]) {
      expect(c?.body).toMatch(/^A role change cannot be decided by the account it applies to/)
      expect(c?.body).toMatch(/403 `self_role_change`/)
      expect(c?.destructive).toBe(false)
    }
    // The consequence the caller asked about is still spelled out underneath.
    expect(demote?.body).toMatch(/loses the admin routes/)
    expect(promote?.body).toMatch(/gains role:manage/)
  })

  it('refuses to remove the last enabled superadmin (409) — demote and disable alike', () => {
    for (const action of ['demote', 'disable'] as const) {
      const c = ask({
        action,
        account: { role: 'superadmin' },
        enabledAdmins: 1,
        enabledSuperadmins: 1,
        nextRole: action === 'demote' ? 'member' : null,
      })

      expect(c?.body, action).toMatch(/only enabled superadmin/)
      expect(c?.body, action).toMatch(/409 `last_superadmin`/)
      expect(c?.body, action).toMatch(/promote a second one first/)
      expect(c?.destructive, action).toBe(false)
    }
  })

  it('does not refuse a demotion of a disabled sole-superadmin row, as the writer does not', () => {
    // `set_user_role` counts only enabled superadmins, so this write is legal —
    // the CLI is the recovery path for a state with no enabled operator.
    const c = ask({
      action: 'demote',
      account: { role: 'superadmin', enabled: false },
      enabledAdmins: 2,
      enabledSuperadmins: 0,
      nextRole: 'member',
    })

    expect(c?.body).not.toMatch(/last_superadmin/)
    expect(c?.destructive).toBe(true)
    expect(c?.body).toMatch(/leaves no enabled superadmin/)
    expect(c?.body).toContain('zolai user set-role')
  })
})

describe("confirmationFor — the caller's role, which the same route answers differently", () => {
  it('refuses an admin who tries to move any role, including a legal-looking one', () => {
    // `set_user_role` tests the **caller** before anything else: `user:manage`
    // creates accounts, resets passwords and disables members, and moving a role
    // is `role:manage`. So this click is a 403 for an admin and a real write for a
    // superadmin — the copy has to know which credential is holding the mouse.
    for (const nextRole of ['member', 'admin', 'superadmin'] as const) {
      const c = ask({
        action: nextRole === 'member' ? 'demote' : 'promote',
        account: { username: 'newbie', role: 'member' },
        actorIsSuperadmin: false,
        nextRole,
      })

      expect(c?.body, nextRole).toContain('role_change_requires_superadmin')
      expect(c?.body, nextRole).toMatch(/only a superadmin/i)
    }
  })

  it('refuses an admin who touches an admin account, in either direction', () => {
    // `set_user_enabled` names both directions: enabling a disabled admin is as
    // much a superadmin act as disabling one, because either way the account ends
    // up holding the admin surfaces.
    const off = ask({
      action: 'enable',
      account: { role: 'admin', enabled: false },
      actorIsSuperadmin: false,
    })
    const on = ask({
      action: 'disable',
      account: { role: 'admin' },
      actorIsSuperadmin: false,
    })

    expect(off).not.toBeNull()
    expect(off?.body).toContain('target_requires_superadmin')
    expect(off?.body).toMatch(/in either direction/)
    expect(on?.body).toContain('target_requires_superadmin')
  })

  it('refuses the same control a superadmin may use, and no other', () => {
    // The pair that makes this a caller rule rather than a row rule: same account,
    // same action, and only `actorIsSuperadmin` changes the answer.
    const input = {
      action: 'disable' as AccountAction,
      account: { role: 'superadmin' as UserRole },
      actorIsSuperadmin: false,
    }

    expect(ask(input)?.body).toContain('target_requires_superadmin')
    // A superadmin gets the ordinary warning instead — and the last-operator one
    // only once the count says so.
    expect(ask({ ...input, actorIsSuperadmin: true })?.body).not.toContain('target_requires_superadmin')
    expect(
      ask({
        action: 'disable',
        account: { username: 'newbie', role: 'member' },
        actorIsSuperadmin: false,
      }),
    ).not.toBeNull()
  })

  it('lets a superadmin through the caller arms it cannot trip', () => {
    expect(
      ask({ action: 'enable', account: { role: 'admin', enabled: false }, actorIsSuperadmin: true }),
    ).toBeNull()
    expect(
      ask({
        action: 'promote',
        account: { username: 'newbie', role: 'member' },
        actorIsSuperadmin: true,
        nextRole: 'admin',
      }),
    ).toBeNull()
  })
})

describe('confirmationFor — disable', () => {
  it('names the account and the session revocation the server does in the same request', () => {
    const c = ask({ action: 'disable', account: { username: 'newbie', role: 'member' } })

    expect(c?.title).toBe('Disable newbie?')
    expect(c?.confirmLabel).toBe('Disable account')
    expect(c?.destructive).toBe(true)
    expect(c?.body).toContain('cannot sign in again')
    expect(c?.body).toMatch(/revokes every live session/)
    expect(c?.body).not.toMatch(/only enabled account reaching the admin surfaces/)
  })

  it('warns when the enabled row being disabled is the only way back into the panel', () => {
    const c = ask({
      action: 'disable',
      account: { role: 'admin' },
      enabledAdmins: 1,
      enabledSuperadmins: 0,
    })

    expect(c?.body).toMatch(/only enabled account reaching the admin surfaces/)
    expect(c?.body).toMatch(/nothing in this browser could undo it/)
    // Recoverable — and it names the two commands that do it.
    expect(c?.body).toContain('zolai user enable')
    expect(c?.body).toContain('zolai user set-role')
  })

  it('stays quiet about the admin count for a member, and for a row already disabled', () => {
    const member = ask({
      action: 'disable',
      account: { username: 'newbie', role: 'member' },
      enabledAdmins: 1,
      enabledSuperadmins: 0,
    })
    // A disabled row is not in `enabledAdmins` already, so this write takes
    // nothing from the number the warning is about.
    const alreadyOff = ask({
      action: 'disable',
      account: { role: 'admin', enabled: false },
      enabledAdmins: 1,
    })

    expect(member?.body).not.toMatch(/only enabled account reaching the admin surfaces/)
    expect(alreadyOff?.body).not.toMatch(/only enabled account reaching the admin surfaces/)
  })
})

describe('confirmationFor — demote', () => {
  it('titles the role that was picked and says it lands on the next request', () => {
    const c = ask({ action: 'demote', account: { role: 'admin' }, nextRole: 'member' })

    expect(c?.title).toBe('Make founder a member?')
    expect(c?.confirmLabel).toBe('Change to member')
    expect(c?.destructive).toBe(true)
    expect(c?.body).toMatch(/loses the admin routes on their next one/)
  })

  it("treats an unstated target as the writer's default, not a sideways move", () => {
    const c = ask({ action: 'demote', account: { role: 'admin' } })

    expect(c?.confirmLabel).toBe('Change to member')
    expect(c?.body).toMatch(/loses the admin routes/)
    expect(c?.body).not.toMatch(/keeps the admin routes/)
  })

  it('says a superadmin moved to admin keeps the routes but loses role:manage', () => {
    const c = ask({
      action: 'demote',
      account: { role: 'superadmin' },
      enabledSuperadmins: 3,
      nextRole: 'admin',
    })

    expect(c?.title).toBe('Make founder an admin?')
    expect(c?.body).toMatch(/keeps the admin routes but loses role:manage/)
    expect(c?.body).toMatch(/leaves 2 enabled superadmins who can change a role/)
    expect(c?.body).not.toMatch(/only enabled account reaching the admin surfaces/)
  })

  it('names the one-operator margin, and excludes a disabled row from the subtraction', () => {
    const thin = ask({
      action: 'demote',
      account: { role: 'superadmin' },
      enabledSuperadmins: 2,
      nextRole: 'admin',
    })
    // This row is disabled, so it was never in `enabledSuperadmins`; subtracting
    // it would report fewer operators able to grant a role than really remain.
    const disabled = ask({
      action: 'demote',
      account: { role: 'superadmin', enabled: false },
      enabledAdmins: 2,
      enabledSuperadmins: 2,
      nextRole: 'admin',
    })

    expect(thin?.body).toMatch(/leaves 1 enabled superadmin who can change a role/)
    expect(thin?.body).toMatch(/keep a second/)
    expect(disabled?.body).toMatch(/leaves 2 enabled superadmins who can change a role/)
  })

  it('warns when demoting the only enabled admin-or-above account', () => {
    const c = ask({
      action: 'demote',
      account: { role: 'admin' },
      enabledAdmins: 1,
      enabledSuperadmins: 0,
      nextRole: 'member',
    })

    expect(c?.body).toMatch(/only enabled account reaching the admin surfaces/)
    expect(c?.body).toContain('zolai user set-role')
  })
})

describe('confirmationFor — revoke sessions', () => {
  it('confirms with the count-not-a-token promise and stays non-destructive', () => {
    const c = ask({
      action: 'revoke-sessions',
      account: { username: 'newbie', role: 'member' },
      enabledAdmins: 1,
      enabledSuperadmins: 0,
    })

    expect(c?.title).toBe('Sign newbie out everywhere?')
    expect(c?.confirmLabel).toBe('Revoke sessions')
    expect(c?.destructive).toBe(false)
    expect(c?.body).toMatch(/count comes back, never a token/)
  })

  it('says the session in this browser goes too when it is your own row', () => {
    const c = ask({ action: 'revoke-sessions', isSelf: true })

    expect(c?.body).toMatch(/session in this browser/)
  })

  it('never claims a last-admin risk — revoking sessions does not change the role', () => {
    const c = ask({ action: 'revoke-sessions', enabledAdmins: 1, enabledSuperadmins: 0 })

    expect(c?.body).not.toMatch(/only enabled account reaching the admin surfaces/)
    expect(c?.body).not.toMatch(/leaves \d+ enabled superadmin/)
  })
})

describe('createAccountFields', () => {
  /** The default dialog state: a member, no display name. */
  const plain = { displayName: '', role: 'member' as UserRole }

  it('sends no role at all from an actor below superadmin', () => {
    // `role` is what the route tests against the caller *before* inserting, so an
    // admin who sends it — even the value the server would have defaulted to —
    // has to be prevented from sending a rank at all. Absent means `member`.
    expect(createAccountFields({ ...plain, actorIsSuperadmin: false })).toEqual({})
    expect(createAccountFields({ ...plain, displayName: 'New Member', actorIsSuperadmin: false })).toEqual({
      display_name: 'New Member',
    })
  })

  it('sends the role that was picked when a superadmin is creating', () => {
    expect(createAccountFields({ ...plain, role: 'superadmin', actorIsSuperadmin: true })).toEqual({
      role: 'superadmin',
    })
    expect(createAccountFields({ ...plain, actorIsSuperadmin: true })).toEqual({ role: 'member' })
  })

  it('trims the display name and drops it when blank', () => {
    // A whitespace-only name is not a name: stored as ` ` it renders as an empty
    // slot everywhere and cannot be told apart from absent.
    expect(
      createAccountFields({
        displayName: '   ',
        role: 'member',
        actorIsSuperadmin: true,
      }),
    ).toEqual({ role: 'member' })
    expect(
      createAccountFields({
        displayName: '  Peter Pau Sian Lian  ',
        role: 'member',
        actorIsSuperadmin: true,
      }),
    ).toEqual({ display_name: 'Peter Pau Sian Lian', role: 'member' })
  })
})
