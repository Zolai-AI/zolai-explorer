import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE_CHOICES,
  HIDE_BELOW_CLASS,
  alignClass,
  compareSortValues,
  dataTableSortFn,
  hideBelowClass,
  pageRange,
  resolvePageSize,
  rowsSummary,
} from './datatable'

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
})
