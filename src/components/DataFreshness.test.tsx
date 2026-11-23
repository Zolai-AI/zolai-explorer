import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataFreshness, freshnessCopy, relativeFetched } from './DataFreshness'

/**
 * The pure time/state logic is pinned first; the rendered markup is asserted
 * through `react-dom/server` (this repo has no DOM implementation, but
 * server-rendering tests are the established pattern — see
 * `components/ErrorState.test.tsx`). `updatedAtMs` is always *this browser's
 * receive time* (query.dataUpdatedAt); these specs keep it from ever producing
 * a fabricated or negative age, in the string **and** on screen.
 */

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0) // fixed "now" — the functions take it as an argument

/** A fixed *receive* instant, so the absolute label is assertable (it is
 *  derived from `updatedAtMs` alone — only the relative label reads the clock). */
const FIXED = Date.UTC(2026, 9, 29, 14, 30, 0)

describe('relativeFetched', () => {
  it('returns null for a nullish or non-positive timestamp — never a real-looking time', () => {
    expect(relativeFetched(null, NOW)).toBeNull()
    expect(relativeFetched(undefined, NOW)).toBeNull()
    expect(relativeFetched(0, NOW)).toBeNull() // TanStack uses 0 for "never"
    expect(relativeFetched(Number.NaN, NOW)).toBeNull()
    expect(relativeFetched(Number.POSITIVE_INFINITY, NOW)).toBeNull()
    expect(relativeFetched(-5_000, NOW)).toBeNull()
  })

  it('states sub-minute ages as "just now", never "0 min ago"', () => {
    expect(relativeFetched(NOW, NOW)).toBe('just now')
    expect(relativeFetched(NOW - 59_000, NOW)).toBe('just now')
  })

  it('floors a future timestamp (clock skew) to "just now", never a negative age', () => {
    expect(relativeFetched(NOW + 90_000, NOW)).toBe('just now')
  })

  it('renders minutes with singular/plural, from the minute boundary', () => {
    expect(relativeFetched(NOW - 60_000, NOW)).toBe('1 min ago')
    expect(relativeFetched(NOW - 4 * 60_000, NOW)).toBe('4 min ago')
    expect(relativeFetched(NOW - 59 * 60_000, NOW)).toBe('59 min ago')
  })

  it('switches to hours at the hour boundary and floors', () => {
    expect(relativeFetched(NOW - 60 * 60_000, NOW)).toBe('1 hr ago')
    expect(relativeFetched(NOW - 5 * 60 * 60_000, NOW)).toBe('5 hr ago')
    expect(relativeFetched(NOW - (24 * 60 * 60_000 - 1), NOW)).toBe('23 hr ago')
  })

  it('switches to days at the day boundary, singular below two', () => {
    expect(relativeFetched(NOW - 24 * 60 * 60_000, NOW)).toBe('1 day ago')
    expect(relativeFetched(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe('2 days ago')
    expect(relativeFetched(NOW - 3 * 24 * 60 * 60_000 - 2 * 60 * 60_000, NOW)).toBe('3 days ago')
  })
})

describe('freshnessCopy', () => {
  it('says "not fetched yet" — with no digits — when there is no payload time', () => {
    const absent = freshnessCopy(0, NOW)
    expect(absent.fetched).toBe(false)
    expect(absent.text).toBe('not fetched yet')
    expect(absent.text).not.toMatch(/\d/)

    expect(freshnessCopy(null, NOW).text).toBe('not fetched yet')
    expect(freshnessCopy(undefined, NOW).fetched).toBe(false)
  })

  it('always uses "fetched", never "updated"/"synced"/"current" (browser receive time only)', () => {
    const copy = freshnessCopy(NOW - 4 * 60_000, NOW)
    expect(copy.fetched).toBe(true)
    expect(copy.text).toBe('fetched 4 min ago')
    expect(copy.text).not.toMatch(/updated|synced|current/i)
  })

  it('never turns a nullish timestamp into a fetched claim', () => {
    for (const value of [null, undefined, 0, Number.NaN]) {
      expect(freshnessCopy(value, NOW).fetched).toBe(false)
    }
  })
})

/**
 * The pure functions can be honest while the rendered node is not — a stray
 * `new Date(0)` in the absent branch would print 1970 and read as a real
 * receive time. These assert what actually reaches the DOM.
 */
describe('the rendered line', () => {
  const render = (props: Partial<Parameters<typeof DataFreshness>[0]> = {}) =>
    renderToStaticMarkup(
      <DataFreshness
        updatedAtMs={0}
        isFetching={false}
        onRefresh={() => undefined}
        {...props}
      />,
    )

  it('prints no timestamp at all when nothing was received', () => {
    const html = render({ updatedAtMs: 0 })
    expect(html).toContain('not fetched yet')
    // The word "fetched" appears in the *absent* sentence too, so what must not
    // appear is a positive claim — a time in front of it.
    expect(html).not.toMatch(/fetched (just now|\d)/)
    // No epoch date masquerading as a real receive time.
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(html).not.toMatch(/\d+ (min|hr|day)s? ago/)
  })

  it('states the receive time once one exists', () => {
    const html = render({ updatedAtMs: Date.now() })
    expect(html).toContain('fetched just now')
    expect(html).not.toContain('not fetched yet')
  })

  /**
   * WCAG 1.4.13: content that only appears on hover is not hoverable,
   * persistent, or dismissible — and a native `title` is unreachable by
   * keyboard and touch. The absolute receive time used to ride in one, so it
   * now renders as visible text in a real `<time>` element.
   */
  it('carries no native title tooltip, with a time or without one', () => {
    expect(render({ updatedAtMs: FIXED })).not.toMatch(/\stitle=/)
    expect(render({ updatedAtMs: 0 })).not.toMatch(/\stitle=/)
  })

  it('prints the absolute receive time without a hover, as a machine-readable <time>', () => {
    const html = render({ updatedAtMs: FIXED })
    // The value a screen reader, a keyboard user and a touch user all get.
    // Attribute name is matched case-insensitively: `renderToStaticMarkup`
    // emits the React prop name (`dateTime`), the DOM lowercases it.
    expect(html).toMatch(/<time[^>]*datetime="2026-10-29T14:30:00\.000Z"/i)
    expect(html).toContain('2026-10-29 14:30 UTC')
  })

  it('keeps the relative label intact beside the absolute time (no re-spelled copy)', () => {
    const html = render({ subject: 'statistics', updatedAtMs: Date.now() })
    expect(html).toContain('statistics fetched just now')
    expect(html).toMatch(/fetched just now<\/span>.*<time/s)
  })

  it('keeps the separator attached to the Refresh button', () => {
    // As siblings, the `·` stayed on the previous line when the row wrapped and
    // pointed at nothing. It now lives in the same span as the button.
    const html = render({ updatedAtMs: FIXED })
    expect(html).toMatch(/<span aria-hidden="true">·<\/span><button/s)
  })

  it('renders no <time> element when nothing was received — an unknown is not a date', () => {
    expect(render({ updatedAtMs: 0 })).not.toContain('<time')
  })

  it('scopes the claim to the payload it describes', () => {
    expect(render({ subject: 'statistics' })).toContain('statistics not fetched yet')
  })

  it('shows the action as in-flight rather than idle while the query runs', () => {
    const html = render({ isFetching: true })
    expect(html).toContain('Fetching')
    expect(html).toMatch(/disabled[^>]*>/)
  })
})
