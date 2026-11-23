/**
 * The role-request model, asserted branch by branch.
 *
 * This is where the page's promises are made or broken, and every branch is a
 * reading of `zolai-core/zolai/api/role_requests_router.py` and the guarded
 * writer in `session_auth.py` — which is why the branching lives in a pure
 * module instead of inside JSX: `Requests.tsx` needs a router, and a static
 * render can only ever see the state a page opens in. What the render cannot
 * check, this can: what the form would offer a credential that the route is
 * documented to refuse.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATUS_FILTER,
  REASON_MAX,
  REASON_MIN,
  STATUS_FILTER_VALUES,
  askEligibility,
  askErrors,
  canDecide,
  decisionErrors,
  statusBadge,
  statusFilterFromSearch,
  statusSearch,
} from './requestActions'

/** A reason long enough to clear the server's own 10-character floor. */
const OK_REASON = 'I maintain the provider settings and need to clear contributor asks.'

describe('askEligibility — who may ask, and for what', () => {
  it('offers a member both requestable ranks, in ladder order', () => {
    const result = askEligibility({ role: 'member', authSource: 'session' })

    expect(result.canAsk).toBe(true)
    if (!result.canAsk) throw new Error('unreachable')
    expect(result.roles).toEqual(['admin', 'superadmin'])
  })

  it('offers an admin only the rank above them — a 409 is never a menu item', () => {
    // `role_already_held` is what the server answers an admin who asks for
    // `admin`; a select that listed it would be a submit button that cannot work.
    const result = askEligibility({ role: 'admin', authSource: 'session' })

    expect(result.canAsk).toBe(true)
    if (!result.canAsk) throw new Error('unreachable')
    expect(result.roles).toEqual(['superadmin'])
  })

  it('says so plainly at the top of the ladder instead of rendering an empty select', () => {
    const result = askEligibility({ role: 'superadmin', authSource: 'session' })

    expect(result.canAsk).toBe(false)
    if (result.canAsk) throw new Error('unreachable')
    expect(result.kind).toBe('top-of-ladder')
    expect(result.reason).toMatch(/superadmin/)
  })

  it('points an anonymous visitor at the sign-in page', () => {
    const result = askEligibility({ role: 'anonymous', authSource: 'anonymous' })

    expect(result.canAsk).toBe(false)
    if (result.canAsk) throw new Error('unreachable')
    expect(result.kind).toBe('sign-in')
    expect(result.reason).toMatch(/username and password/)
  })

  it('refuses a key and an OAuth token by name, because the credential is the problem', () => {
    // Both carry a *role*. A copy that said "you are not signed in" would be
    // wrong, and one that said "you lack the role" would be wronger: `_person()`
    // is what answers, and it says the credential has no account behind it.
    const key = askEligibility({ role: 'superadmin', authSource: 'api_key' })
    const oauth = askEligibility({ role: 'admin', authSource: 'oauth' })

    expect(key.canAsk).toBe(false)
    expect(oauth.canAsk).toBe(false)
    if (key.canAsk || oauth.canAsk) throw new Error('unreachable')
    expect(key.kind).toBe('credential')
    expect(oauth.kind).toBe('credential')
    expect(key.reason).toContain('API key')
    expect(oauth.reason).toContain('OAuth token')
    // The refusal is quoted as the server spells it, on both.
    expect(key.reason).toContain('session_required')
    expect(oauth.reason).toContain('session_required')
    // A high rank must never talk the page into offering the ask anyway.
    expect(key.reason).not.toMatch(/you need the member role/)
  })

  it('refuses on credential kind before rank — a key gets no ladder', () => {
    const result = askEligibility({ role: 'member', authSource: 'api_key' })

    expect(result.canAsk).toBe(false)
    if (result.canAsk) throw new Error('unreachable')
    expect(result.kind).toBe('credential')
  })
})

describe('askErrors — why submit stays off', () => {
  it('accepts a well-formed ask', () => {
    expect(askErrors({ requestedRole: 'admin', reason: OK_REASON, role: 'member' })).toEqual({})
  })

  it('refuses a role outside the requestable set', () => {
    // `member` is a real role and not a thing you ask for; `overlord` is neither.
    expect(askErrors({ requestedRole: 'member', reason: OK_REASON, role: 'anonymous' }).requested_role).toBeDefined()
    expect(askErrors({ requestedRole: 'overlord', reason: OK_REASON, role: 'member' }).requested_role).toBeDefined()
    expect(askErrors({ requestedRole: '', reason: OK_REASON, role: 'member' }).requested_role).toBeDefined()
  })

  it('refuses a rank at or below the caller’s own', () => {
    // Two cases the server catches too (409 `role_already_held`): equal and below.
    expect(askErrors({ requestedRole: 'admin', reason: OK_REASON, role: 'admin' }).requested_role).toBeDefined()
    expect(askErrors({ requestedRole: 'admin', reason: OK_REASON, role: 'superadmin' }).requested_role).toBeDefined()
    // The only *upward* ask an admin can make stays clean.
    expect(askErrors({ requestedRole: 'superadmin', reason: OK_REASON, role: 'admin' })).toEqual({})
  })

  it('refuses an empty or whitespace reason', () => {
    expect(askErrors({ requestedRole: 'admin', reason: '', role: 'member' }).reason).toBeDefined()
    expect(askErrors({ requestedRole: 'admin', reason: '   \n ', role: 'member' }).reason).toBeDefined()
  })

  it('holds the server’s own floor and names the shortfall', () => {
    const short = 'a'.repeat(REASON_MIN - 1)
    const error = askErrors({ requestedRole: 'admin', reason: short, role: 'member' }).reason

    expect(error).toBeDefined()
    expect(error).toContain(String(REASON_MIN))
    // What the applicant typed is reported back, so the gap is not a riddle.
    expect(error).toContain(String(short.length))
    // One character over the floor is accepted — the bound is inclusive.
    expect(askErrors({ requestedRole: 'admin', reason: 'a'.repeat(REASON_MIN), role: 'member' })).toEqual({})
  })

  it('holds the server’s ceiling', () => {
    expect(
      askErrors({ requestedRole: 'admin', reason: 'a'.repeat(REASON_MAX + 1), role: 'member' }).reason,
    ).toBeDefined()
    expect(askErrors({ requestedRole: 'admin', reason: 'a'.repeat(REASON_MAX), role: 'member' })).toEqual({})
  })

  it('trims before measuring, the way the transport sends it', () => {
    const padded = `   ${OK_REASON}   `
    expect(padded.length).toBeGreaterThan(OK_REASON.length)
    expect(askErrors({ requestedRole: 'admin', reason: padded, role: 'member' })).toEqual({})
  })
})

describe('decisionErrors — the one decision that cannot be a click', () => {
  it('requires a note to reject', () => {
    expect(decisionErrors({ decision: 'reject', note: '' }).note).toBeDefined()
    expect(decisionErrors({ decision: 'reject', note: '  \t ' }).note).toBeDefined()
    expect(decisionErrors({ decision: 'reject', note: 'Scope is covered by their current key.' })).toEqual({})
  })

  it('lets an approval stay silent — the role is the answer', () => {
    expect(decisionErrors({ decision: 'approve', note: '' })).toEqual({})
    expect(decisionErrors({ decision: 'approve', note: 'Welcome aboard.' })).toEqual({})
  })
})

describe('the queue filter lives in the URL', () => {
  it('opens on the work, not on everything', () => {
    expect(DEFAULT_STATUS_FILTER).toBe('pending')
    expect(statusFilterFromSearch('')).toBe('pending')
    expect(statusFilterFromSearch('?status=')).toBe('pending')
  })

  it('reads every filter it offers', () => {
    for (const filter of STATUS_FILTER_VALUES) {
      expect(statusFilterFromSearch(`?status=${filter}`), filter).toBe(filter)
    }
  })

  it('falls back to the default on a value outside the closed set', () => {
    // A hand-edited `?status=decided` must not send a filter the server answers
    // 400 `invalid_status` for; the page keeps its own default instead.
    expect(statusFilterFromSearch('?status=decided')).toBe(DEFAULT_STATUS_FILTER)
    expect(statusFilterFromSearch('?status=Pending')).toBe('pending') // case-folded
    expect(statusFilterFromSearch('?status=%20all%20')).toBe('all') // trimmed
    expect(statusFilterFromSearch('?tab=audit')).toBe(DEFAULT_STATUS_FILTER)
  })

  it('omits the default from the link and round-trips every filter', () => {
    expect(statusSearch(DEFAULT_STATUS_FILTER)).toBe('')
    for (const filter of STATUS_FILTER_VALUES) {
      const search = statusSearch(filter)
      expect(statusFilterFromSearch(search), search).toBe(filter)
    }
  })

  it('asks for `all` as a filter and never invents a fourth row status', () => {
    // `all` is a query, not a state a row can hold: `queuePath` is what drops it
    // (the server answers 400 `invalid_status` for a status no column stores), and
    // the three row states below are the only ones `statusBadge` can be asked
    // about.
    expect(statusSearch('all')).toBe('?status=all')
    expect(STATUS_FILTER_VALUES).toEqual(['pending', 'approved', 'rejected', 'all'])
  })
})

describe('statusBadge — the three states a row can be in', () => {
  it('labels and tones each state distinctly', () => {
    expect(statusBadge('pending')).toEqual({ label: 'Pending', tone: 'waiting' })
    expect(statusBadge('approved')).toEqual({ label: 'Approved', tone: 'granted' })
    expect(statusBadge('rejected')).toEqual({ label: 'Rejected', tone: 'declined' })
  })

  it('never paints an unknown state as granted', () => {
    // The schema `.catch()`es a foreign status to `pending`, so the worst a
    // strange payload can render as is "still waiting".
    expect(statusBadge('pending').tone).not.toBe('granted')
  })
})

describe('canDecide', () => {
  it('is exactly the superadmin role', () => {
    // `role:manage` is what makes a credential a superadmin, and the queue
    // depends on both halves; the client can only read the rank it was given.
    expect(canDecide('superadmin')).toBe(true)
    expect(canDecide('admin')).toBe(false)
    expect(canDecide('member')).toBe(false)
    expect(canDecide('anonymous')).toBe(false)
  })
})
