/**
 * The admin users panel, rendered — identity, and the controls that write.
 *
 * This runs through `react-dom/server` (the suite is deliberately DOM-free), so
 * only the initial state is observable: no clicking. What that still pins, and
 * why it is worth pinning:
 *
 *   - the row the **server** says is you is marked. Nothing else can mark it —
 *     an API key cannot be mapped to an account, so `/auth/me` sends no username
 *     and the panel must mark *no* row rather than guess;
 *   - the write controls exist on every row (list / create / role / password /
 *     revoke is the whole admin surface — a missing control is a feature that
 *     does not work);
 *   - **which of those controls exists is itself a test.** The writer guards the
 *     caller's rank, so the same row renders a role picker for a superadmin and a
 *     read-only rank for an admin, and Enable/Disable appears only where
 *     `user:manage` actually reaches. A control the server would refuse is not
 *     offered — an admin who "just opened the box" and re-picked the current rank
 *     would earn a 403, because `PUT /admin/users/{username}` routes *any* `role`
 *     in the body through the guarded writer.
 *   - no confirm dialog is armed on first render, so nothing destructive is
 *     already loaded behind a stray Enter.
 *
 * The confirm copy itself is not asserted here because a closed Radix dialog
 * renders nothing; it is pinned exhaustively in `accountActions.test.ts`, which
 * is where the branching lives.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersPanel } from './UsersPanel'
import { ADMIN_USERS_KEY } from './api'
import type { AdminUser, AuthMe } from '../../lib/schemas'

// Identity is the input under test, so it is the thing that gets stubbed; the
// marker must be derived from it, not faked.
const useAuthMeMock = vi.hoisted(() => vi.fn())
vi.mock('../../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/auth')>()
  return { ...actual, useAuthMe: useAuthMeMock }
})

const ANON: AuthMe = {
  role: 'anonymous',
  key_prefix: null,
  scopes: [],
  mode: '',
  auth_source: 'anonymous',
  username: null,
}

/** A password session for `founder` — the only credential that reports a name. */
const SESSION: AuthMe = { ...ANON, role: 'admin', auth_source: 'session', username: 'founder' }

/** The same account promoted: the row-level controls are decided by this rank. */
const SUPER_SESSION: AuthMe = { ...SESSION, role: 'superadmin' }

/** An admin API key: the server ranks it admin but cannot say whose account it is. */
const KEY: AuthMe = {
  ...ANON,
  role: 'admin',
  auth_source: 'api_key',
  key_prefix: 'zolai_sk_ab12',
  username: null,
}

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 1,
    username: 'founder',
    display_name: 'Peter Pau Sian Lian',
    role: 'admin',
    enabled: true,
    created_at: '2026-10-06 09:00:00',
    updated_at: '2026-10-06 09:00:00',
    last_login: null,
    ...overrides,
  }
}

/** `founder` (the signed-in account) plus a second row that must not be marked. */
const TWO_ROWS = {
  items: [user(), user({ id: 2, username: 'newbie', display_name: 'New Member', role: 'member' })],
  count: 2,
}

function render(
  seed: { items: AdminUser[]; count: number } = TWO_ROWS,
  me: AuthMe = SESSION,
): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seated under the *exported* key, so a key rename cannot quietly turn this
  // into a test of the loading skeleton.
  client.setQueryData(ADMIN_USERS_KEY, seed)
  useAuthMeMock.mockReturnValue(me)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <UsersPanel />
    </QueryClientProvider>,
  )
}

/** The rendered `<li>` for one account, so a marker can be attributed to a row. */
function rowFor(html: string, username: string): string {
  return html.split('<li ').find((row) => row.includes(username)) ?? ''
}

beforeEach(() => {
  useAuthMeMock.mockReturnValue(SESSION)
})

describe('the signed-in account is marked', () => {
  it('marks the row whose username the server reported', () => {
    const html = render()

    expect(rowFor(html, 'founder')).toContain('>you<')
  })

  it('does not mark anybody else', () => {
    const html = render()

    expect(rowFor(html, 'newbie')).not.toContain('>you<')
  })

  it('marks nothing for an API key — the server cannot say whose account it is', () => {
    const html = render(TWO_ROWS, KEY)

    expect(html).not.toContain('>you<')
  })

  it('marks nothing while the identity is still unknown', () => {
    expect(render(TWO_ROWS, ANON)).not.toContain('>you<')
  })
})

describe('the role is rendered from the one display copy', () => {
  it('labels a superadmin row Superadmin, the way the top bar does', () => {
    const html = render({
      items: [user({ role: 'superadmin' })],
      count: 1,
    })

    expect(rowFor(html, 'founder')).toContain('Superadmin')
  })

  it('labels a member row Member, not a bare role token', () => {
    const html = render({ items: [user({ username: 'newbie', role: 'member' })], count: 1 })

    expect(rowFor(html, 'newbie')).toContain('Member')
  })
})

describe('the write surface is complete', () => {
  it('renders the controls each row needs, plus the create action', () => {
    // The full surface is only what a superadmin sees; the admin half is pinned
    // in the next block, where the server's rank cap takes controls away.
    const html = render(TWO_ROWS, SUPER_SESSION)

    expect(html).toContain('Add user')
    expect(html).toContain('Change password')
    expect(html).toContain('Revoke sessions')
    expect(html).toContain('Role')
    expect(html).toContain('Disable')
  })

  it('gives a superadmin an actual role picker on the row', () => {
    // The `SelectTrigger` id is the picker; the alternative is a sentence. A
    // closed Select renders no label in static markup, so this is the honest way
    // to tell "can change the role" from "is told the role".
    const html = render({ items: [user({ id: 7, role: 'member' })], count: 1 }, SUPER_SESSION)

    expect(html).toContain('id="role-7"')
  })

  it('offers Enable, not Disable, for an account that is already disabled', () => {
    const html = render({ items: [user({ enabled: false })], count: 1 }, SUPER_SESSION)

    expect(html).toContain('Enable')
    expect(html).not.toContain('Disable')
  })

  it('arms no confirm dialog on first render', () => {
    // A destructive write must never be pre-armed: the dialog exists only once
    // an action was requested *and* `confirmationFor` returned copy for it.
    expect(render(TWO_ROWS, SUPER_SESSION)).not.toContain('data-slot="alert-dialog-content"')
  })
})

describe('controls the server would refuse are not offered', () => {
  const memberRow = { items: [user({ id: 3, username: 'newbie', role: 'member' })], count: 1 }
  const adminRow = { items: [user({ id: 4, username: 'cocurator', role: 'admin' })], count: 1 }

  it('replaces an admin’s role picker with the rank the row already shows', () => {
    const html = render(memberRow)

    expect(html).not.toContain('id="role-3"')
    expect(html).toContain('set by a superadmin')
  })

  it('still lets an admin enable and disable a member', () => {
    // `user:manage` reaches members in both directions — withholding this would
    // be the panel refusing a write the server accepts.
    const html = render(memberRow)

    expect(html).toContain('Disable')
    expect(html).not.toContain('superadmin’s')
  })

  it('withholds Enable/Disable from an admin for an admin-or-above row, and says why', () => {
    const html = render(adminRow)

    expect(html).not.toContain('>Disable<')
    expect(html).not.toContain('>Enable<')
    expect(html).toContain('superadmin’s call')
  })

  it('puts a disabled admin row the same way, in the other direction', () => {
    const html = render({ items: [user({ id: 5, role: 'admin', enabled: false })], count: 1 })

    expect(html).toContain('Enabling an admin-or-above account')
  })

  it('keeps the controls a rank cap does not touch: password and session revocation', () => {
    const html = render(adminRow)

    expect(html).toContain('Change password')
    expect(html).toContain('Revoke sessions')
  })

  it('hands the create dialog the actor’s rank and builds the body from it', () => {
    // The dialog is closed on first render, so what is observable here is that the
    // rank reaches it at all: `POST /admin/users` refuses a non-member start from
    // below superadmin *before* inserting, so an admin must not send `role`.
    const source = readFileSync(
      fileURLToPath(new URL('./UsersPanel.tsx', import.meta.url)),
      'utf8',
    )

    expect(source).toMatch(/<CreateUserDialog[\s\S]{0,200}actorIsSuperadmin=\{actorIsSuperadmin\}/)
    expect(source).toContain('createAccountFields({ displayName, role, actorIsSuperadmin })')
  })
})

describe('the panel names its own contract', () => {
  it('keeps the strict-guard note on the card', () => {
    expect(render()).toContain('strict user:manage + admin role')
  })

  it('goes through the feature transports instead of hand-writing a request', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./UsersPanel.tsx', import.meta.url)),
      'utf8',
    )

    expect(source).toContain('useAdminUsers')
    // API paths belong to `lib/endpoints.ts`; the panel reads hooks.
    expect(source).not.toMatch(/\/api\/v1/)
  })
})
