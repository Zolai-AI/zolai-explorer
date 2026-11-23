/**
 * What a failed request *says*.
 *
 * `ErrorPanel` is the one failure surface shared by every panel, so a status the
 * copy does not understand shows up everywhere at once. These specs pin the two
 * statuses that used to collapse into one another:
 *
 *   - **401** — no usable credential. Prompts for a key (never a retry: repeating
 *     an unauthenticated request cannot succeed);
 *   - **403** — the credential was recognised and the *permission* was refused.
 *     The server's detail for a role failure is the bare token `forbidden`, which
 *     explains nothing, so the panel has to say what it means. Rendering
 *     "Request failed (HTTP 403) · forbidden" over the admin users list is how an
 *     honest "you are not an admin" becomes an unreadable error.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { describeError, ErrorPanel, ErrorState, failureDetail } from './ErrorState'
import { ApiError } from '../lib/api'

/** A 403 as the server actually shapes it: `detail.error` becomes the message. */
const forbidden = () => new ApiError('forbidden', 403, '/api/v1/admin/users', 'http')

describe('a 403', () => {
  it('explains the refusal instead of echoing the raw `forbidden` token', () => {
    const html = renderToStaticMarkup(<ErrorPanel error={forbidden()} />)

    expect(html).toContain('Not permitted')
    expect(html).not.toContain('forbidden')
    expect(html).toContain('scope or role')
  })

  it('keeps the server message when the server sent one that says something', () => {
    const error = new ApiError('missing settings:write scope', 403, '/api/v1/u', 'http')
    const html = renderToStaticMarkup(<ErrorPanel error={error} />)

    expect(html).toContain('missing settings:write scope')
    expect(html).toContain('Not permitted')
  })

  it('offers no retry — the same credential cannot become permitted', () => {
    const html = renderToStaticMarkup(<ErrorPanel error={forbidden()} onRetry={() => {}} />)

    expect(html).not.toContain('Retry')
  })
})

describe('a 401', () => {
  it('offers the way back in rather than describing an HTTP failure', () => {
    const error = new ApiError('unauthorized', 401, '/api/v1/admin/users', 'unauthorized')
    const html = renderToStaticMarkup(<ErrorPanel error={error} />)

    expect(html).toContain('Credential refused')
    expect(html).toContain('sign in again from the top bar')
    // A 401 is not a permission problem, so it must not borrow the 403 wording.
    expect(html).not.toContain('Not permitted')
    // An expired session and a revoked key both arrive as 401, so the panel may
    // not assume which credential the server refused.
    expect(html).not.toMatch(/the API key is missing|paste a valid key|API key dialog/)
  })
})

describe('a 403 on the inline variant', () => {
  it('carries the same honest copy as the panel wrapper', () => {
    const html = renderToStaticMarkup(<ErrorState error={forbidden()} />)

    expect(html).toContain('Not permitted')
    expect(html).toContain('scope or role')
  })
})

describe('a 5xx', () => {
  it('stays retryable and does not claim anything about permission', () => {
    const error = new ApiError('Request failed with HTTP 502', 502, '/api/v1/x', 'http')
    const html = renderToStaticMarkup(<ErrorState error={error} onRetry={() => {}} />)

    expect(html).toContain('HTTP 502')
    expect(html).toContain('Retry')
    expect(html).not.toContain('Not permitted')
  })
})

describe('describeError — the shared kernel the toasts branch on', () => {
  it('exposes stable codes, so copy can be reworded without breaking callers', () => {
    expect(describeError(new ApiError('unauthorized', 401, '/x', 'unauthorized')).code).toBe('needsKey')
    expect(describeError(forbidden()).code).toBe('forbidden')
    expect(describeError(new ApiError('boom', 502, '/x', 'http')).code).toBe('http')
    expect(describeError(new ApiError('failed', 0, '/x', 'timeout')).code).toBe('timeout')
    expect(describeError(new ApiError('Failed to fetch', 0, '/x', 'network')).code).toBe('network')
    expect(describeError(new ApiError('aborted', 0, '/x', 'aborted')).code).toBe('aborted')
    expect(describeError(new ApiError('not json', 0, '/x', 'parse')).code).toBe('parse')
    expect(describeError(new TypeError('x')).code).toBe('unknown')
  })

  it('keeps the tone taxonomy a machine-readable fact, not a rendering accident', () => {
    expect(describeError(new ApiError('unauthorized', 401, '/x', 'unauthorized')).tone).toBe('warning')
    expect(describeError(forbidden()).tone).toBe('neutral')
    expect(describeError(new ApiError('bad gateway', 502, '/x', 'http')).tone).toBe('destructive')
    expect(describeError(new ApiError('t', 0, '/x', 'timeout')).tone).toBe('destructive')
  })

  it('names the cancelled and unreadable cases instead of falling through to bare HTTP copy', () => {
    const aborted = describeError(new ApiError('signal aborted', 0, '/x', 'aborted'))
    expect(aborted.title).toBe('Request cancelled')
    expect(aborted.retryable).toBe(true)

    const parse = describeError(new ApiError('<html>', 0, '/x', 'parse'))
    expect(parse.title).toBe('Unreadable response')
    expect(parse.message).toContain('not as JSON')
  })

  it('renders a fixed sentence for a raw exception — never the exception text', () => {
    // A thrown value can carry request or credential internals; a screenshot of
    // the panel must not become a leak surface.
    const d = describeError(new Error('https://api.example.com?key=sk-secretive'))
    expect(d.message).toBe('The request did not complete.')
    expect(d.message).not.toContain('sk-secretive')
    expect(describeError('a bare string').message).toBe('The request did not complete.')
  })

  it('answers a network failure in human terms, not the browser\'s', () => {
    const d = describeError(new ApiError('Failed to fetch', 0, '/x', 'network'))
    expect(d.message).toBe('The browser could not open a connection to the Zolai Core API.')
    expect(d.retryable).toBe(true)
  })

  it('does not claim every timeout uses the ordinary 15s budget', () => {
    const d = describeError(new ApiError('Request timed out after 65000ms', 0, '/x', 'timeout'))
    expect(d.hint).not.toContain('15s')
    expect(d.hint).toContain('client-side request budget')
  })
})

describe('failureDetail — the one line a toast carries', () => {
  it('keeps an actionable hint and drops an expository one', () => {
    // needsKey's hint names something the user can do; the 403 hint explains
    // how roles work, which belongs on the panel, not in a transient toast.
    expect(failureDetail(new ApiError('unauthorized', 401, '/x', 'unauthorized'))).toContain(
      'sign in again',
    )
    const forbiddenLine = failureDetail(forbidden())
    expect(forbiddenLine).toContain('scope or role')
    expect(forbiddenLine).not.toContain('very next request')
  })

  it('is short enough to read before it disappears', () => {
    for (const error of [
      forbidden(),
      new ApiError('unauthorized', 401, '/x', 'unauthorized'),
      new ApiError('Failed to fetch', 0, '/x', 'network'),
      new ApiError('boom', 500, '/x', 'http'),
    ]) {
      expect(failureDetail(error).length).toBeLessThan(150)
    }
  })
})
