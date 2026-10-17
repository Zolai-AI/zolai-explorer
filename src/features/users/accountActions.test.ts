/**
 * The write-safety model behind the users panel.
 *
 * These specs are the guard rail, not decoration: the server has no
 * self/last-admin protection, so the only thing standing between an admin and a
 * permanent lock-out is this branching — and an untested branch here is exactly
 * how a destructive write becomes one silent click.
 */
import { describe, expect, it } from 'vitest'
import {
  confirmationFor,
  enabledAdminCount,
  endsOwnSession,
  isSelf,
  roleAction,
  toggleAction,
  type AccountAction,
  type AccountRef,
} from './accountActions'

/** A row as `GET /admin/users` returns it (`sanitize_user`, no hash). */
function account(overrides: Partial<AccountRef> = {}): AccountRef {
  return { username: 'founder', role: 'admin', enabled: true, ...overrides }
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

  it('is zero for an empty list', () => {
    expect(enabledAdminCount([])).toBe(0)
  })
})

describe('toggleAction / roleAction', () => {
  it('maps the control state to the write it makes', () => {
    expect(toggleAction({ enabled: true })).toBe('disable')
    expect(toggleAction({ enabled: false })).toBe('enable')
  })

  it('maps a role pick to the write it makes', () => {
    expect(roleAction('admin')).toBe('promote')
    expect(roleAction('member')).toBe('demote')
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
      endsOwnSession({ targetUsername: 'founder', me: 'founder', authSource: 'api-key' }),
    ).toBe(false)
  })

  it('is false when the server reported no identity', () => {
    expect(endsOwnSession({ targetUsername: 'founder', me: null, authSource: 'none' })).toBe(false)
  })
})

describe('confirmationFor — actions that need no confirm', () => {
  it('lets the widening writes through: they are undoable in one click', () => {
    for (const action of ['enable', 'promote'] satisfies AccountAction[]) {
      expect(
        confirmationFor({ action, account: account(), isSelf: true, enabledAdmins: 1 }),
      ).toBeNull()
    }
  })
})

describe('confirmationFor — disable', () => {
  it('names the account and the session revocation the server does in the same request', () => {
    const c = confirmationFor({
      action: 'disable',
      account: account({ username: 'newbie', role: 'member' }),
      isSelf: false,
      enabledAdmins: 2,
    })

    expect(c?.title).toBe('Disable newbie?')
    expect(c?.confirmLabel).toBe('Disable account')
    expect(c?.destructive).toBe(true)
    expect(c?.body).toContain('cannot sign in again')
    expect(c?.body).toMatch(/revokes every live session/)
    // Not our own row and not the last admin: neither warning applies.
    expect(c?.body).not.toMatch(/the account you are signed in as/)
    expect(c?.body).not.toMatch(/only account that can sign in as an admin/)
  })

  it('warns that disabling your own account signs this browser out at once', () => {
    const c = confirmationFor({
      action: 'disable',
      account: account(),
      isSelf: true,
      enabledAdmins: 3,
    })

    expect(c?.body).toMatch(/the account you are signed in as/)
    expect(c?.body).toMatch(/signed out immediately/)
    expect(c?.body).not.toMatch(/only account that can sign in as an admin/)
  })

  it('warns when the row being disabled is the last way back in', () => {
    const c = confirmationFor({
      action: 'disable',
      account: account(),
      isSelf: false,
      enabledAdmins: 1,
    })

    expect(c?.body).toMatch(/only account that can sign in as an admin/)
    // Disabling has a real undo — name the command that does it.
    expect(c?.body).toContain('zolai user enable')
  })

  it('spells out both warnings when it is your own account AND the last admin', () => {
    const c = confirmationFor({
      action: 'disable',
      account: account(),
      isSelf: true,
      enabledAdmins: 1,
    })

    expect(c?.body).toMatch(/signed out immediately/)
    expect(c?.body).toMatch(/nothing in this browser could undo it/)
  })

  it('does not cry "last admin" over disabling a member', () => {
    const c = confirmationFor({
      action: 'disable',
      account: account({ username: 'newbie', role: 'member' }),
      isSelf: false,
      enabledAdmins: 1,
    })

    expect(c?.body).not.toMatch(/only account that can sign in as an admin/)
  })
})

describe('confirmationFor — demote', () => {
  it('says the demotion lands on the next request', () => {
    const c = confirmationFor({
      action: 'demote',
      account: account(),
      isSelf: false,
      enabledAdmins: 2,
    })

    expect(c?.title).toBe('Make founder a member?')
    expect(c?.confirmLabel).toBe('Change to member')
    expect(c?.destructive).toBe(true)
    expect(c?.body).toMatch(/loses the admin routes on their next one/)
  })

  it('warns that demoting yourself costs this browser the admin surface', () => {
    const c = confirmationFor({
      action: 'demote',
      account: account(),
      isSelf: true,
      enabledAdmins: 2,
    })

    expect(c?.body).toMatch(/you are signed in as/)
    expect(c?.body).toMatch(/loses the admin surface on the next request/)
  })

  it('warns that demoting the only admin has no in-browser undo', () => {
    const c = confirmationFor({
      action: 'demote',
      account: account(),
      isSelf: false,
      enabledAdmins: 1,
    })

    expect(c?.body).toMatch(/only account that can sign in as an admin/)
  })

  it('does not promise a CLI way back from a demotion — there is no role command', () => {
    const c = confirmationFor({
      action: 'demote',
      account: account(),
      isSelf: false,
      enabledAdmins: 1,
    })

    // `zolai user` has create/list/disable/enable/password/revoke-sessions and
    // **no** role command, so offering `zolai user enable` here would be a lie.
    expect(c?.body).not.toContain('zolai user enable')
    expect(c?.body).toMatch(/no role command/)
    expect(c?.body).toMatch(/database/)
  })

  it('names the locked panel when you demote your own last-admin account', () => {
    const c = confirmationFor({
      action: 'demote',
      account: account(),
      isSelf: true,
      enabledAdmins: 1,
    })

    expect(c?.body).toMatch(/panel itself needs admin/)
    expect(c?.body).toMatch(/no role command/)
  })
})

describe('confirmationFor — revoke sessions', () => {
  it('confirms with the count-not-a-token promise and stays non-destructive', () => {
    const c = confirmationFor({
      action: 'revoke-sessions',
      account: account({ username: 'newbie', role: 'member' }),
      isSelf: false,
      enabledAdmins: 2,
    })

    expect(c?.title).toBe('Sign newbie out everywhere?')
    expect(c?.confirmLabel).toBe('Revoke sessions')
    expect(c?.destructive).toBe(false)
    expect(c?.body).toMatch(/count comes back, never a token/)
  })

  it('says the session in this browser goes too when it is your own row', () => {
    const c = confirmationFor({
      action: 'revoke-sessions',
      account: account(),
      isSelf: true,
      enabledAdmins: 2,
    })

    expect(c?.body).toMatch(/session in this browser/)
  })

  it('never claims a last-admin risk — revoking sessions does not change the role', () => {
    const c = confirmationFor({
      action: 'revoke-sessions',
      account: account(),
      isSelf: false,
      enabledAdmins: 1,
    })

    expect(c?.body).not.toMatch(/only account that can sign in as an admin/)
  })
})
