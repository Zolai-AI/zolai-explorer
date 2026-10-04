import { describe, expect, it } from 'vitest'
import {
  HIDE_BELOW_CLASS,
  alignClass,
  compareSortValues,
  dataTableSortFn,
  hideBelowClass,
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
