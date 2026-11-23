/**
 * The requests page, rendered — what each credential is offered, and what it is
 * told why.
 *
 * Like the rest of the suite this runs through `react-dom/server`: the initial
 * state is what is observable, and on this page the initial state *is* the
 * security story. Everything that would happen after a click — the ask's 409,
 * the note a rejection needs, which guard refused a decision — is pinned in
 * `requestActions.test.ts`, where the branching lives, and in the core suite
 * where the route answers.
 *
 * What is worth pinning here is what only a render can pin: that a credential the
 * route refuses is *not* offered a submit button, that a read the route refuses is
 * *not* mounted, and that the queue — the one panel that can hand out privilege —
 * appears for exactly the rank that can use it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Requests } from './Requests'
import { ROLE_REQUEST_KEYS } from '../features/role-requests/api'
import type { AuthMe, RoleRequest } from '../lib/schemas'

// Identity drives every branch on this page, so it is stubbed rather than
// negotiated with a fake `/auth/me` response — the panel must derive from it.
const useAuthMeMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>()
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

const ME: AuthMe = {
  ...ANON,
  role: 'member',
  auth_source: 'session',
  username: 'peter',
}

const ADMIN: AuthMe = { ...ME, role: 'admin', username: 'editor' }
const SUPER: AuthMe = { ...ME, role: 'superadmin', username: 'founder' }
const KEY: AuthMe = {
  ...ANON,
  role: 'superadmin',
  auth_source: 'api_key',
  key_prefix: 'zolai_sk_ab12',
  username: null,
}

function ask(overrides: Partial<RoleRequest> = {}): RoleRequest {
  return {
    id: 3,
    user_id: 7,
    username: 'peter',
    requested_role: 'superadmin',
    reason: 'I keep the provider settings and need to clear contributor asks weekly.',
    status: 'pending',
    created_at: '2026-10-30T09:12:44.318Z',
    decided_by: null,
    decided_at: null,
    note: null,
    ...overrides,
  }
}

function render(seed: { mine?: RoleRequest[]; queue?: RoleRequest[] } = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seated under the *exported* keys, so a key rename cannot quietly turn this
  // into a test of two loading skeletons.
  client.setQueryData(ROLE_REQUEST_KEYS.mine(20), {
    items: seed.mine ?? [],
    count: (seed.mine ?? []).length,
  })
  client.setQueryData(ROLE_REQUEST_KEYS.queue('pending'), {
    items: seed.queue ?? [],
    count: (seed.queue ?? []).length,
    status: 'pending',
  })
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/requests']}>
      <QueryClientProvider client={client}>
        <Requests />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthMeMock.mockReturnValue(ME)
})

describe('the ask is offered to exactly the people who can use it', () => {
  it('gives a signed-in member the form', () => {
    const html = render()

    expect(html).toContain('Ask for a role')
    expect(html).toContain('id="ask-reason"')
    expect(html).toContain('id="ask-role"')
    // Radix renders a closed select's label client-side only, so what a static
    // render can prove about the default choice is the description under it: the
    // rank a member opens on is `admin`, and its own words are printed.
    expect(html).toContain('Management access: provider settings')
  })

  it('gives an admin the form too, opening on the one rank above them', () => {
    useAuthMeMock.mockReturnValue(ADMIN)

    const html = render()

    expect(html).toContain('id="ask-role"')
    // Not `admin` — that is the rank they already hold, and asking for it is the
    // 409 the server states. The only thing left to ask for is described instead.
    expect(html).toContain('plus role changes and the request queue')
    expect(html).not.toContain('Management access: provider settings')
  })

  it('says nothing is left to ask for, at the top of the ladder', () => {
    useAuthMeMock.mockReturnValue(SUPER)

    const html = render()

    expect(html).toContain('Nothing left to ask for')
    expect(html).not.toContain('id="ask-reason"')
  })

  it('refuses an API key by naming the credential, not the rank', () => {
    // The key in this fixture *is* a superadmin key. A page that read only the
    // role would offer the ask and earn a 403 on submit.
    useAuthMeMock.mockReturnValue(KEY)

    const html = render()

    expect(html).not.toContain('id="ask-reason"')
    expect(html).toContain('API key')
    expect(html).toContain('session_required')
    // And it still shows the way to the credential that would work.
    expect(html).toContain('/login')
  })

  it('does not mount the read of /mine for a key the route would refuse', () => {
    useAuthMeMock.mockReturnValue(KEY)

    expect(render()).not.toContain('Your asks')
  })

  it('lists the account’s own asks once there is an account', () => {
    const html = render({ mine: [ask({ reason: 'Need to review contributor asks in my parish.' })] })

    expect(html).toContain('Your asks')
    expect(html).toContain('Need to review contributor asks in my parish.')
    expect(html).toContain('Pending')
  })

  it('shows what a decision cost, including a blank approval', () => {
    const html = render({
      mine: [
        ask({ status: 'approved', decided_by: 'founder', decided_at: '2026-10-30T11:02:00.000Z' }),
        ask({
          id: 4,
          requested_role: 'admin',
          status: 'rejected',
          decided_by: 'founder',
          note: 'Your key already covers this scope.',
        }),
      ],
    })

    expect(html).toContain('Granted')
    expect(html).toContain('Approved')
    expect(html).toContain('No note was left with the decision.')
    expect(html).toContain('Rejected')
    expect(html).toContain('Your key already covers this scope.')
  })
})

describe('contributing is not what this page is for', () => {
  it('states that plainly and links to the form', () => {
    const html = render()

    expect(html).toContain('Contributing needs no role')
    expect(html).toContain('href="/contribute"')
  })
})

describe('the decision queue is the superadmin’s, and only theirs', () => {
  it('is absent for a member and an admin', () => {
    expect(render()).not.toContain('Decision queue')

    useAuthMeMock.mockReturnValue(ADMIN)
    expect(render()).not.toContain('Decision queue')
  })

  it('appears for a superadmin, with a decision control per pending ask', () => {
    useAuthMeMock.mockReturnValue(SUPER)

    const html = render({ queue: [ask({ username: 'peter' })] })

    expect(html).toContain('Decision queue')
    expect(html).toContain('peter')
    expect(html).toContain('>Decide<')
    // The applicant’s own words, in full or disclosed, are what a decision reads.
    expect(html).toContain('provider settings')
  })

  it('offers nothing to decide on an ask that is already decided', () => {
    useAuthMeMock.mockReturnValue(SUPER)

    const html = render({
      queue: [ask({ status: 'rejected', decided_by: 'founder', note: 'Ask again after the audit.' })],
    })

    expect(html).not.toContain('>Decide<')
    expect(html).toContain('Ask again after the audit.')
  })

  it('says the queue is empty rather than showing a wall of nothing', () => {
    useAuthMeMock.mockReturnValue(SUPER)

    expect(render({ queue: [] })).toContain('Nothing is waiting')
  })
})

describe('no credential reaches a URL (source guard)', () => {
  const PAGE = readFileSync(
    fileURLToPath(new URL('./Requests.tsx', import.meta.url)),
    'utf8',
  )
  const API = readFileSync(
    fileURLToPath(new URL('../features/role-requests/api.ts', import.meta.url)),
    'utf8',
  )
  const CODE = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('never puts an identity, token or key into a query string', () => {
    const code = `${CODE(PAGE)}\n${CODE(API)}`

    // Whose rows these are is what the header proves. There is no parameter for
    // it to build, and `minePath` / `queuePath` carry only `limit` and `status`.
    expect(code).not.toMatch(/user_id\s*=/)
    expect(code).not.toMatch(/[?&](token|key|api_key|bearer)=/)
    expect(code).not.toMatch(/Authorization/)
    expect(CODE(API)).not.toMatch(/sessionToken|getStoredKey|apiKey/)
  })

  it('keeps the only filter it appends by hand inside the closed set', () => {
    // `queryLimitPath` emits `limit` plus required params; `status` is appended
    // here, so this is the one place a value could escape the set the server parses.
    expect(CODE(API)).toMatch(/status=\$\{encodeURIComponent\(status\)}/)
    expect(CODE(API)).not.toMatch(/status=\$\{String\(/)
  })

  it('reads the queue through the registry, never a hand-typed path', () => {
    const code = CODE(API)

    expect(code).toContain("queryLimitPath('roles.queue'")
    expect(code).toContain("endpointPath('roles.request.create')")
    expect(code).toContain("endpointPath('roles.decision'")
    expect(code).not.toMatch(/apiPost<unknown>\(['`]\/role-requests/)
  })
})
