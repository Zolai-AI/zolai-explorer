/**
 * Role-request transports — the ask, the applicant's own list, and the queue.
 *
 * Paths come from the endpoint registry (`endpointPath` / `queryLimitPath`), so
 * the method, the `{request_id}` segment and the `limit` placement have one
 * owner; `endpoints.test.ts` fails if a literal reappears here. Optional query
 * parameters are appended the way `features/review/api.ts` does it, because
 * `queryLimitPath` only carries the *required* ones and a filter it dropped would
 * leave the cache key promising rows the wire never asked for.
 *
 * **No credential is in a path or a query string.** The session token travels in
 * the `Authorization` header `lib/api.ts` attaches, which is the whole reason
 * `/role-requests/mine` has no `user_id` parameter: whose rows this reads is what
 * the credential proves, never what the caller types. A `?user_id=` in a URL would
 * land in browser history, in server access logs, and in a link pasted into chat.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/api'
import { endpointPath, queryLimitPath } from '../../lib/endpoints'
import {
  RoleRequestCreatedSchema,
  RoleRequestDecisionSchema,
  RoleRequestListSchema,
  RoleRequestQueueSchema,
  parseOrThrow,
  type RoleRequestCreated,
  type RoleRequestDecision,
  type RoleRequestInput,
  type RoleRequestList,
  type RoleRequestQueue,
} from '../../lib/schemas'
import type { StatusFilter } from './requestActions'

/**
 * Query keys, exported so a render test seats a payload under the *same* key the
 * hooks read — a mistyped key renders a loading skeleton and asserts nothing.
 */
export const ROLE_REQUEST_KEYS = {
  mine: (limit: number) => ['role-requests', 'mine', limit] as const,
  queue: (status: StatusFilter) => ['role-requests', 'queue', status] as const,
}

/** This account's own asks: `/role-requests/mine?limit=20`. */
export function minePath(limit: number): string {
  return queryLimitPath('roles.request.mine', {}, limit)
}

/**
 * The queue URL for one filter.
 *
 * `all` is **omitted** rather than sent: `_parse_status` on the server maps both
 * an unset and an `all` filter to "no WHERE clause", while a literal
 * `status=all` is not a row status and would be answered 400 `invalid_status`.
 */
export function queuePath(status: StatusFilter, limit: number): string {
  const base = queryLimitPath('roles.queue', {}, limit)
  if (status === 'all') return base
  return `${base}&status=${encodeURIComponent(status)}`
}

/**
 * This account's own asks.
 *
 * `enabled` is the caller's answer to "is this a session?". The route is
 * `_MEMBER_GUARD` **plus** `_person()`, so an API key or an OAuth token gets 403
 * `session_required` — a page that mounted the read for a key-authenticated
 * browser would be firing a request it is documented to refuse, and rendering
 * that refusal where the honest statement is "this credential has no account".
 */
export function useMyRoleRequests(enabled: boolean, limit = 20) {
  return useQuery({
    queryKey: ROLE_REQUEST_KEYS.mine(limit),
    enabled,
    queryFn: async ({ signal }): Promise<RoleRequestList> =>
      parseOrThrow(
        RoleRequestListSchema,
        await apiGet<unknown>(minePath(limit), { signal }),
        'my role requests',
      ),
  })
}

/** The queue — `role:manage` + superadmin, and the page only mounts this for it. */
export function useRoleRequestQueue(status: StatusFilter, enabled: boolean, limit = 50) {
  return useQuery({
    queryKey: ROLE_REQUEST_KEYS.queue(status),
    enabled,
    queryFn: async ({ signal }): Promise<RoleRequestQueue> =>
      parseOrThrow(
        RoleRequestQueueSchema,
        await apiGet<unknown>(queuePath(status, limit), { signal }),
        'role request queue',
      ),
  })
}

export function useCreateRoleRequest() {
  const client = useQueryClient()
  return useMutation<RoleRequestCreated, Error, RoleRequestInput>({
    mutationFn: async (input): Promise<RoleRequestCreated> =>
      parseOrThrow(
        RoleRequestCreatedSchema,
        await apiPost<unknown>(endpointPath('roles.request.create'), input),
        'role request created',
      ),
    onSuccess: () => {
      // One prefix covers both: the new ask belongs in the applicant's list, and
      // a superadmin who asked also has the queue open.
      client.invalidateQueries({ queryKey: ['role-requests'] })
    },
  })
}

export type DecisionInput = {
  requestId: number
  decision: 'approve' | 'reject'
  note: string
}

export function useDecideRoleRequest() {
  const client = useQueryClient()
  return useMutation<RoleRequestDecision, Error, DecisionInput>({
    mutationFn: async (input): Promise<RoleRequestDecision> =>
      parseOrThrow(
        RoleRequestDecisionSchema,
        await apiPost<unknown>(endpointPath('roles.decision', { request_id: input.requestId }), {
          decision: input.decision,
          // A blank note travels as *absent*, not as `""`: the server requires one
          // for a rejection and stores it verbatim, so an empty string would be a
          // note the applicant reads as a deliberate blank.
          note: input.note.trim() || undefined,
        }),
        'role request decision',
      ),
    onSuccess: () => {
      // An approval writes `users.role` through the guarded writer, so two caches
      // just went stale: this queue row (it is now `approved`), and the account
      // list behind it, which the Users panel is showing a rank out of. `/auth/me`
      // is *not* refreshed — the decision changed somebody else's rank, and a
      // reflexive identity refetch on every write is how a panel hides a stale
      // role behind a request that proves nothing.
      client.invalidateQueries({ queryKey: ['role-requests'] })
      client.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: () => {
      // Re-read the queue after a refusal too. `ApiError` carries status and the
      // server's sentence, not the machine `error` token, so the client cannot
      // know *which* guard fired — but `decide_role_request` flips the status only
      // after the role writer succeeds, so a refused approve leaves the row
      // `pending` and the panel must show the server's state, not a guessed one.
      client.invalidateQueries({ queryKey: ['role-requests'] })
    },
  })
}
