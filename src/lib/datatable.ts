/**
 * Pure helpers behind `src/components/DataTable.tsx`.
 *
 * The table itself is shadcn `<Table>` markup driven by
 * `@tanstack/react-table`; sorting is delegated to TanStack with a single
 * comparator that reproduces the previous hand-rolled behaviour (numeric
 * ascending/descending for numbers, locale compare for strings).
 *
 * Kept here — free of React and the DOM — so the sort comparator and the
 * responsive column-hiding map are unit tested in a plain Node environment.
 */

import { constructSortFn } from '@tanstack/react-table'

/** Tailwind class that reveals a column at and above a breakpoint. */
export const HIDE_BELOW_CLASS = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const

export type HideBelow = keyof typeof HIDE_BELOW_CLASS

export function hideBelowClass(hideBelow: HideBelow | undefined): string {
  return hideBelow ? HIDE_BELOW_CLASS[hideBelow] : ''
}

/**
 * Ascending comparator for a column's sort value. Numbers compare
 * numerically; everything else compares as a locale-aware string with numeric
 * chunks (`item2` before `item10`), and nullish values sort last.
 */
export function compareSortValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0
    if (Number.isNaN(a)) return 1
    if (Number.isNaN(b)) return -1
    return a - b
  }
  const left = a === null || a === undefined ? '' : String(a)
  const right = b === null || b === undefined ? '' : String(b)
  if (left === right) return 0
  if (left === '') return 1
  if (right === '') return -1
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * TanStack sorting function built from `compareSortValues`. Column defs are
 * given an `accessorFn` returning the already-resolved sort value, so this
 * comparator only ever sees primitives.
 */
export const dataTableSortFn = constructSortFn({
  sort: (a, b) => compareSortValues(a, b),
})

/** Tailwind alignment class for a column. */
export function alignClass(align: 'left' | 'right' | 'center' | undefined): string {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

/**
 * Human range for the pagination footer, e.g. `1–10 of 24 rows`. Pure so the
 * arithmetic is unit tested and cannot drift from the markup.
 */
export function pageRange(pageIndex: number, pageSize: number, totalRows: number): string {
  if (totalRows <= 0 || pageSize <= 0) return `0 of 0 rows`
  const first = pageIndex * pageSize + 1
  const last = Math.min((pageIndex + 1) * pageSize, totalRows)
  if (first > totalRows) return `0 of ${totalRows} rows`
  return `${first}\u2013${last} of ${totalRows} rows`
}
