import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE_CHOICES,
  HIDE_BELOW_CLASS,
  HIDE_BELOW_QUERY,
  HIDE_BELOW_TIERS,
  HIDDEN_COLUMN_LABEL_LIMIT,
  alignClass,
  compareSortValues,
  dataTableSortFn,
  hiddenColumnsAt,
  hiddenTiersAtWidth,
  hideBelowClass,
  pageRange,
  resolvePageSize,
  rowsSummary,
  type HideBelow,
} from './datatable'

/** A `hiddenColumnsAt` predicate from a viewport width in rem (375px ≈ 23.44, 1440px = 90). */
const hiddenAt =
  (widthRem: number) =>
  (tier: HideBelow): boolean =>
    hiddenTiersAtWidth(widthRem).includes(tier)

describe('compareSortValues', () => {
  it('orders numbers numerically, not lexicographically', () => {
    const sorted = [10, 2, 33, 4].sort(compareSortValues)
    expect(sorted).toEqual([2, 4, 10, 33])
  })

  it('returns 0 for equal numbers', () => {
    expect(compareSortValues(7, 7)).toBe(0)
  })

  it('compares strings with locale rules and numeric awareness', () => {
    expect(compareSortValues('apple', 'banana')).toBeLessThan(0)
    expect(compareSortValues('banana', 'apple')).toBeGreaterThan(0)
    expect(compareSortValues('pasian', 'pasian')).toBe(0)
    // Natural ordering: 'item2' before 'item10'.
    expect(compareSortValues('item2', 'item10')).toBeLessThan(0)
  })

  it('is case-insensitive so Pasian and gam sort naturally', () => {
    expect(compareSortValues('PASIAN', 'pasian')).toBe(0)
  })

  it('sorts nullish values last instead of throwing', () => {
    expect(compareSortValues(null, 'a')).toBeGreaterThan(0)
    expect(compareSortValues('a', undefined)).toBeLessThan(0)
    expect(compareSortValues(null, undefined)).toBe(0)
  })

  it('sorts NaN last', () => {
    expect(compareSortValues(Number.NaN, 1)).toBeGreaterThan(0)
    expect(compareSortValues(Number.NaN, Number.NaN)).toBe(0)
  })

  it('falls back to string comparison for mixed types', () => {
    expect(compareSortValues(1, 'a')).toBeLessThan(0)
  })
})

describe('dataTableSortFn', () => {
  /**
   * Minimal stand-in for a TanStack Row: `constructSortFn` reads the column's
   * resolved value through `row.getValue(columnId)`.
   */
  const row = (value: unknown) => ({ getValue: () => value }) as never

  it('is directly usable as a column `sortFn`', () => {
    expect(typeof dataTableSortFn).toBe('function')
    expect(dataTableSortFn(row(1), row(9), 'count')).toBeLessThan(0)
    expect(dataTableSortFn(row('b'), row('a'), 'label')).toBeGreaterThan(0)
  })
})

describe('per-breakpoint column hiding', () => {
  it('maps each breakpoint to the matching reveal class', () => {
    expect(hideBelowClass('sm')).toBe(HIDE_BELOW_CLASS.sm)
    expect(hideBelowClass('md')).toBe('hidden md:table-cell')
    expect(hideBelowClass('lg')).toBe('hidden lg:table-cell')
    expect(hideBelowClass('xl')).toBe('hidden xl:table-cell')
  })

  it('leaves always-visible columns untouched', () => {
    expect(hideBelowClass(undefined)).toBe('')
  })

  it('hides by default and reveals at the breakpoint (mobile-first)', () => {
    for (const cls of Object.values(HIDE_BELOW_CLASS)) {
      expect(cls.startsWith('hidden ')).toBe(true)
    }
  })
})

describe('alignClass', () => {
  it('defaults to left and honours right/centre', () => {
    expect(alignClass(undefined)).toBe('text-left')
    expect(alignClass('left')).toBe('text-left')
    expect(alignClass('right')).toBe('text-right')
    expect(alignClass('center')).toBe('text-center')
  })
})

describe('pageRange', () => {
  it('counts over the rows fetched, never a server total it was not given', () => {
    expect(pageRange(0, 10, 24)).toBe('1\u201310 of 24 rows fetched')
    expect(pageRange(2, 10, 24)).toBe('21\u201324 of 24 rows fetched')
  })

  it('handles an empty or degenerate page without throwing', () => {
    expect(pageRange(0, 10, 0)).toBe('0 of 0 rows fetched')
    expect(pageRange(0, 0, 12)).toBe('0 of 0 rows fetched')
    expect(pageRange(9, 10, 24)).toBe('0 of 24 rows fetched')
  })
})

describe('resolvePageSize', () => {
  it('accepts a listed choice, as a number or a string', () => {
    expect(resolvePageSize(50)).toBe(50)
    expect(resolvePageSize('20')).toBe(20)
  })

  it('falls back for an unlisted, empty or hostile value', () => {
    expect(resolvePageSize(37)).toBe(DEFAULT_PAGE_SIZE_CHOICES[0])
    expect(resolvePageSize('abc')).toBe(DEFAULT_PAGE_SIZE_CHOICES[0])
    expect(resolvePageSize(null)).toBe(DEFAULT_PAGE_SIZE_CHOICES[0])
    expect(resolvePageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE_CHOICES[0])
  })

  it('honours a caller-supplied choice list and fallback', () => {
    expect(resolvePageSize('200', [10, 20, 200], 50)).toBe(200)
    expect(resolvePageSize('7', [10, 20, 200], 50)).toBe(50)
  })
})

describe('rowsSummary', () => {
  it('states the limit instead of inventing a total', () => {
    expect(rowsSummary(12, 20).text).toBe('showing 12 rows (limit 20)')
    expect(rowsSummary(1, 20).text).toBe('showing 1 row (limit 20)')
  })

  it('warns exactly when the fetched count equals the limit', () => {
    const hit = rowsSummary(20, 20)
    expect(hit.truncated).toBe(true)
    expect(hit.notice).toMatch(/exactly the limit/)
    expect(rowsSummary(19, 20).truncated).toBe(false)
    expect(rowsSummary(19, 20).notice).toBe('')
  })

  it('drops the limit wording when the route returns everything', () => {
    expect(rowsSummary(12, null)).toEqual({ text: '12 rows', truncated: false, notice: '' })
    expect(rowsSummary(1, null).text).toBe('1 row')
  })

  it('is defensive about a bad count', () => {
    expect(rowsSummary(Number.NaN, 20).text).toBe('showing 0 rows (limit 20)')
    expect(rowsSummary(-5, 20).text).toBe('showing 0 rows (limit 20)')
  })

  it('separates what was fetched from what is on screen', () => {
    expect(rowsSummary(10, 20, 20).text).toBe('showing 10 of 20 rows fetched (limit 20)')
    expect(rowsSummary(10, null, 20).text).toBe('showing 10 of 20 rows fetched')
    expect(rowsSummary(10, null, 20).truncated).toBe(false)
  })

  it('reports truncation from the fetched count, not the visible one', () => {
    // 20 fetched under a limit of 20 — more may exist — even though only the
    // first 10 are on screen.
    const hit = rowsSummary(10, 20, 20)
    expect(hit.truncated).toBe(true)
    expect(hit.notice).toMatch(/exactly the limit/)
  })

  it('only advises the action the page can actually take', () => {
    // The defect this pins: the cursor-paginated review queue was told to
    // "raise the limit", which that page has no control for.
    expect(rowsSummary(20, 20, 20, 'cursor').notice).toMatch(/Load the next page/)
    expect(rowsSummary(20, 20, 20, 'cursor').notice).not.toMatch(/Raise the limit/)
    expect(rowsSummary(20, 20, 20, 'limit').notice).toMatch(/Raise the limit/)
    expect(rowsSummary(20, 20, 20, 'none').notice).not.toMatch(/Raise the limit|Load the next page/)
    // An unspecified reach must not silently promise a way out.
    expect(rowsSummary(20, 20, 20).notice).toBe(rowsSummary(20, 20, 20, 'none').notice)
  })

  it('keeps the two-argument wording for every existing caller', () => {
    expect(rowsSummary(12, 20).text).toBe('showing 12 rows (limit 20)')
    expect(rowsSummary(12, null).text).toBe('12 rows')
  })
})

describe('hideBelow breakpoint table', () => {
  it('keys the reveal classes and the media queries identically', () => {
    expect(HIDE_BELOW_TIERS).toEqual(Object.keys(HIDE_BELOW_CLASS))
    expect(HIDE_BELOW_TIERS).toEqual(Object.keys(HIDE_BELOW_QUERY))
  })

  it('derives each query from Tailwind 4 default min-widths, not magic numbers', () => {
    // These are the same breakpoints the reveal CSS uses (sm 40rem … xl 80rem),
    // so the query and `HIDE_BELOW_CLASS[tier]` cannot drift apart.
    expect(HIDE_BELOW_QUERY.sm).toBe('(min-width: 40rem)')
    expect(HIDE_BELOW_QUERY.md).toBe('(min-width: 48rem)')
    expect(HIDE_BELOW_QUERY.lg).toBe('(min-width: 64rem)')
    expect(HIDE_BELOW_QUERY.xl).toBe('(min-width: 80rem)')
  })

  it('reports the higher tiers as the viewport shrinks', () => {
    expect(hiddenTiersAtWidth(90)).toEqual([]) // 1440px — nothing hidden
    expect(hiddenTiersAtWidth(60)).toEqual(['lg', 'xl']) // 960px — sm/md revealed
    expect(hiddenTiersAtWidth(23.4375)).toEqual(['sm', 'md', 'lg', 'xl']) // 375px
  })
})

describe('hiddenColumnsAt', () => {
  it('reports nothing when no column carries hideBelow', () => {
    const result = hiddenColumnsAt(
      [{ key: 'a', header: 'A' }, { key: 'b', header: 'B', hideBelow: undefined }],
      () => true,
    )
    expect(result).toEqual({ count: 0, labels: [], more: 0, text: '' })
  })

  it('names a sm-tier column hidden at an xs viewport but not at an xl viewport', () => {
    const specs = [{ key: 'g', header: 'Group', hideBelow: 'sm' as const }]
    expect(hiddenColumnsAt(specs, hiddenAt(23.4375)).count).toBe(1)
    expect(hiddenColumnsAt(specs, hiddenAt(23.4375)).labels).toEqual(['Group'])
    expect(hiddenColumnsAt(specs, hiddenAt(90)).count).toBe(0)
  })

  it('caps the named list and reports the remainder', () => {
    const specs = ['A', 'B', 'C', 'D', 'E'].map((h, i) => ({
      key: `c${i}`,
      header: h,
      hideBelow: 'sm' as const,
    }))
    const result = hiddenColumnsAt(specs, () => true)
    expect(result.count).toBe(5)
    expect(result.labels).toHaveLength(HIDDEN_COLUMN_LABEL_LIMIT)
    expect(result.more).toBe(2)
    expect(result.text).toBe('5 columns hidden at this width: A, B, C (+2 more)')
  })

  it('falls back to the key for a non-string header instead of printing an object', () => {
    const result = hiddenColumnsAt(
      [{ key: 'updated_at', header: { type: 'badge', props: {} }, hideBelow: 'md' as const }],
      () => true,
    )
    expect(result.labels).toEqual(['updated_at'])
    expect(result.text).not.toContain('[object Object]')
  })

  it('words the footer exactly for one versus several hidden columns', () => {
    expect(hiddenColumnsAt([{ key: 'n', header: 'Notes', hideBelow: 'sm' as const }], () => true).text).toBe(
      '1 column hidden at this width: Notes',
    )
    expect(
      hiddenColumnsAt(
        [
          { key: 'kv', header: 'Knowledge version', hideBelow: 'sm' as const },
          { key: 'n', header: 'Notes', hideBelow: 'md' as const },
          { key: 'u', header: 'Updated', hideBelow: 'lg' as const },
        ],
        () => true,
      ).text,
    ).toBe('3 columns hidden at this width: Knowledge version, Notes, Updated')
  })

  it('is a statement about the viewport, never a claim that the data is absent', () => {
    const text = hiddenColumnsAt(
      [{ key: 'n', header: 'Notes', hideBelow: 'sm' as const }],
      () => true,
    ).text
    expect(text).toMatch(/hidden at this width/)
    expect(text).not.toMatch(/unavailable|no data|not returned/i)
  })
})
