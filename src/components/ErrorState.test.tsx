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
import { ErrorPanel, ErrorState } from './ErrorState'
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
  it('still prompts for a key rather than describing an HTTP failure', () => {
    const error = new ApiError('unauthorized', 401, '/api/v1/admin/users', 'unauthorized')
    const html = renderToStaticMarkup(<ErrorPanel error={error} />)

    expect(html).toContain('API key required')
    // A 401 is not a permission problem, so it must not borrow the 403 wording.
    expect(html).not.toContain('Not permitted')
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
