/**
 * Agent failure copy.
 *
 * Every agent run on the deployment returned HTTP 524 — Cloudflare's edge
 * timeout — because the run took ~219s against a documented 60s budget that was
 * never enforced. It arrives bodyless, so the page fell through to a generic
 * "Run failed" for a condition with a known cause.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { failedDetail, failedTitle, isEdgeTimeout } from './agentErrors'

const http = (status: number) => new ApiError(`HTTP ${status}`, status, '/api/v1/agent/runs', 'http')

describe('isEdgeTimeout', () => {
  it('recognises 524 and nothing else', () => {
    expect(isEdgeTimeout(http(524))).toBe(true)
    expect(isEdgeTimeout(http(504))).toBe(false)
    expect(isEdgeTimeout(http(500))).toBe(false)
    expect(isEdgeTimeout(new Error('boom'))).toBe(false)
    expect(isEdgeTimeout(null)).toBe(false)
  })
})

describe('failedTitle', () => {
  it('names a 524 rather than reporting a generic failure', () => {
    expect(failedTitle(http(524))).toBe('The run took too long for the CDN')
  })

  it('keeps the credential and budget branches distinct', () => {
    expect(failedTitle(http(401))).toBe('API key required')
    expect(failedTitle(http(403))).toBe('Not allowed for this key')
    expect(failedTitle(http(429))).toBe('Run budget reached')
  })

  it('distinguishes a client-side timeout from any HTTP status', () => {
    const timeout = new ApiError('Request timed out', 0, '/u', 'timeout')
    expect(failedTitle(timeout)).toBe('The run exceeded the time budget')
  })

  it('falls back for anything unrecognised', () => {
    expect(failedTitle(http(500))).toBe('Run failed')
    expect(failedTitle(new Error('nope'))).toBe('Run failed')
  })
})

describe('failedDetail', () => {
  it('explains the 524 instead of returning a bare status line', () => {
    const detail = failedDetail(http(524), 65)
    expect(detail).toMatch(/proxy/i)
    expect(detail).not.toMatch(/^HTTP 524$/)
  })

  it('quotes the client budget it actually waited', () => {
    const timeout = new ApiError('t', 0, '/u', 'timeout')
    expect(failedDetail(timeout, 65)).toContain('65s')
    expect(failedDetail(timeout, 30)).toContain('30s')
  })

  it('keeps the rate-limit and scope messages actionable', () => {
    expect(failedDetail(http(429), 65)).toMatch(/Five runs per minute/)
    expect(failedDetail(http(403), 65)).toMatch(/member\+/)
  })

  it('surfaces the server message for other failures', () => {
    expect(failedDetail(http(500), 65)).toBe('HTTP 500')
  })
})
