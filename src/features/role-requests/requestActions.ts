/**
 * The role-request model — who may ask, what a valid ask is, what a decision
 * costs, and how the queue's state lives in a URL.
 *
 * Pure (no React, no `fetch`) for the same reason `users/accountActions.ts` is:
 * the branching *is* the message, and a Node-env suite can assert every branch
 * of it. Nothing here decides a permission — the server does, on every request.
 * What this module owns is the *promise the page makes before the click*: it may
 * not offer an ask the route will refuse, and it must name the refusal it will
 * get. Two sources of truth about who can ask is how a page ends up with a
 * submit button that only ever 403s.
 *
 * The rules are read off `zolai-core/zolai/api/role_requests_router.py`:
 *
 * - `_MEMBER_GUARD` is `require_role('member', strict=True)` — an absent
 *   credential is refused in **warn mode too**, so "try it and see" is not a
 *   reading of the warn-mode banner here;
 * - `_person()` then requires the resolved credential to be a **person**. An API
 *   key and an MCP OAuth token both have a role and no account behind them, so
 *   both get 403 `session_required`;
 * - a rank at or above the asked role is 409 `role_already_held`;
 * - `RoleRequestIn` bounds the reason at 10–1000 characters;
 * - a rejection without a note is 400 `note_required`, because "rejected" alone
 *   is not an answer the applicant can act on;
 * - approval runs through the one guarded role writer, so `self_role_change` /
 *   `last_superadmin` refuse and the request **stays pending**. The page does not
 *   classify which guard answered — `ApiError` carries the status and the server's
 *   sentence, not the machine token — so on a refusal it re-reads the queue and
 *   renders the row's state as the server has it.
 */

import { can, rankOf, type Role } from '../../lib/auth'
import {
  REQUESTABLE_ROLE_VALUES,
  ROLE_REQUEST_STATUS_VALUES,
  type MeAuthSource,
  type RequestableRole,
  type RoleRequestStatus,
} from '../../lib/schemas'

/** The queue filter the page offers: the three states, plus "everything". */
export const STATUS_FILTER_VALUES = [...ROLE_REQUEST_STATUS_VALUES, 'all'] as const
export type StatusFilter = (typeof STATUS_FILTER_VALUES)[number]

/** The filter `/requests` opens with when the URL does not name one. */
export const DEFAULT_STATUS_FILTER: StatusFilter = 'pending'

export type AskEligibility =
  | { canAsk: true; roles: RequestableRole[] }
  | {
      canAsk: false
      /** Why the control is absent, in the words the page prints. */
      reason: string
      /** `sign-in` links to `/login`; `credential` says the key is the problem. */
      kind: 'sign-in' | 'credential' | 'top-of-ladder'
    }

/**
 * May this credential ask, and for what?
 *
 * `roles` is the ladder *above* the caller's current rank: an account holding
 * `admin` asking for `admin` is a 409 the server states, so the form never
 * offers it. A superadmin has nothing above them, which is said plainly rather
 * than rendered as an empty select.
 */
export function askEligibility(input: {
  role: Role
  authSource: MeAuthSource
}): AskEligibility {
  const { role, authSource } = input

  if (authSource !== 'session') {
    // The server answered the role, so the credential is real — it is the *kind*
    // that has no account to hold a role. `role_for` can read a scope into
    // `superadmin`, which is exactly why the sentence names the credential rather
    // than the rank.
    if (authSource === 'anonymous') {
      return {
        canAsk: false,
        kind: 'sign-in',
        reason:
          'A role belongs to an account, so the ask comes from one: sign in with a username and ' +
          'password. An anonymous visitor has no account to change.',
      }
    }
    return {
      canAsk: false,
      kind: 'credential',
      reason:
        (authSource === 'api_key' ? 'This browser is authenticated with an API key' : 'This browser is authenticated with an OAuth token') +
        ', which is a machine credential with no account behind it — there is no role for it to ' +
        'hold, so the server answers 403 `session_required`. Sign in with the account instead.',
    }
  }

  const roles = REQUESTABLE_ROLE_VALUES.filter((value) => rankOf(value) > rankOf(role))
  if (roles.length === 0) {
    return {
      canAsk: false,
      kind: 'top-of-ladder',
      reason:
        'Your account already holds superadmin, the top of the ladder — there is no role left to ' +
        'ask for. You decide other people\'s asks below.',
    }
  }

  return { canAsk: true, roles: [...roles] }
}

export type AskErrors = { requested_role?: string; reason?: string }

/** The server's own bound on a reason, stated once so the form and the wire agree. */
export const REASON_MIN = 10
export const REASON_MAX = 1000

/**
 * Why submit stays disabled.
 *
 * Deliberately **not** a `try/catch` around the request: `/role-requests` counts
 * five asks per minute per account, so a form that fired on every empty submit
 * burns the applicant's budget on requests the server was never going to record.
 */
export function askErrors(input: {
  requestedRole: string
  reason: string
  role: Role
}): AskErrors {
  const errors: AskErrors = {}
  const asked = input.requestedRole as RequestableRole
  if (!REQUESTABLE_ROLE_VALUES.includes(asked)) {
    errors.requested_role = 'Choose the role you are asking for.'
  } else if (rankOf(asked) <= rankOf(input.role)) {
    // Catchable in the browser, and the server checks it anyway: the ask is only
    // a request if there is something above the current rank to request.
    errors.requested_role = `Your account already holds '${input.role}', which covers '${asked}'. There is nothing to approve.`
  }

  const reason = input.reason.trim()
  if (reason.length === 0) {
    errors.reason = 'A superadmin reads this before deciding — say why the role is needed.'
  } else if (reason.length < REASON_MIN) {
    errors.reason = `A few words more, please (${REASON_MIN} characters minimum, ${reason.length} so far).`
  } else if (reason.length > REASON_MAX) {
    errors.reason = `That is ${reason.length} characters; the reason is capped at ${REASON_MAX}.`
  }

  return errors
}

export type DecisionErrors = { note?: string }

/**
 * A rejection is the one decision that cannot be a single click.
 *
 * The server answers 400 `note_required` for an empty note, and it is right: the
 * applicant reads this sentence and decides whether to ask again, so "rejected"
 * on its own is not an answer. Approval may be silent — the role is the answer.
 */
export function decisionErrors(input: { decision: 'approve' | 'reject'; note: string }): DecisionErrors {
  if (input.decision === 'reject' && input.note.trim().length === 0) {
    return { note: 'Say why — the applicant reads this and decides whether to ask again.' }
  }
  return {}
}

/**
 * Decode `?status=` for the queue.
 *
 * Anything outside the closed set — including a hand-edited `?status=whatever` —
 * is treated as "the URL named nothing", so the page keeps its default instead of
 * requesting a filter the server would answer 400 for.
 */
export function statusFilterFromSearch(search: string): StatusFilter {
  const params = new URLSearchParams(search)
  const raw = (params.get('status') ?? '').trim().toLowerCase()
  return (STATUS_FILTER_VALUES as readonly string[]).includes(raw)
    ? (raw as StatusFilter)
    : DEFAULT_STATUS_FILTER
}

/** The minimal query string: the default filter is not restated. */
export function statusSearch(filter: StatusFilter): string {
  if (filter === DEFAULT_STATUS_FILTER) return ''
  const params = new URLSearchParams()
  params.set('status', filter)
  return `?${params.toString()}`
}

/** Label + tone for one queue row's status, derived from the closed set. */
export function statusBadge(status: RoleRequestStatus): { label: string; tone: 'waiting' | 'granted' | 'declined' } {
  return status === 'approved'
    ? { label: 'Approved', tone: 'granted' }
    : status === 'rejected'
      ? { label: 'Rejected', tone: 'declined' }
      : { label: 'Pending', tone: 'waiting' }
}

/** Whether this credential reads the queue at all (`role:manage` + superadmin). */
export function canDecide(role: Role): boolean {
  return can(role, 'superadmin')
}
