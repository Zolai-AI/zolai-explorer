/**
 * Failure copy for the Agent page, as pure functions.
 *
 * They live here rather than inline in the route so they can be unit-tested —
 * the branching is the whole point of these messages, and untested branching in a
 * route file is how "Run failed" ends up describing a CDN timeout.
 *
 * 524 deserves its own branch: it is Cloudflare's edge timeout, not an
 * application status, it arrives with no body, and it is what every agent run on
 * this deployment returned while the run took ~219s against a documented 60s
 * budget that was never enforced. A user who hit it got nothing but a generic
 * failure for a condition with a known cause.
 */

import { isApiError } from './api'

/** Cloudflare closed the connection before the origin answered. */
export function isEdgeTimeout(error: unknown): boolean {
  return isApiError(error) && error.status === 524
}

export function failedTitle(error: unknown): string {
  if (isEdgeTimeout(error)) return 'The run took too long for the CDN'
  if (isApiError(error)) {
    if (error.status === 403) return 'Not allowed for this key'
    if (error.status === 429) return 'Run budget reached'
    if (error.kind === 'timeout') return 'The run exceeded the time budget'
    if (error.status === 401) return 'API key required'
  }
  return 'Run failed'
}

export function failedDetail(error: unknown, clientBudgetS: number): string {
  if (isEdgeTimeout(error)) {
    return 'The proxy closed the connection after ~100s before the server answered. The run itself had not failed — try a narrower goal, or run it again now the server enforces its own 60s budget.'
  }
  if (isApiError(error)) {
    if (error.status === 403) return 'This key lacks a member+ role on the server.'
    if (error.status === 429) return 'Five runs per minute per key — wait a moment and try again.'
    if (error.kind === 'timeout') {
      return `No answer within ${clientBudgetS}s; the server budget is 60s.`
    }
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
