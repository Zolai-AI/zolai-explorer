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
 * Human range for the **client-side** page footer, e.g.
 * `1–10 of 24 rows fetched`. Pure so the arithmetic is unit tested and cannot
 * drift from the markup.
 *
 * The wording says "fetched" on purpose: these endpoints return bare arrays with
 * no server total, so a plain "of 24 rows" would read as a corpus count.
 */
export function pageRange(pageIndex: number, pageSize: number, totalRows: number): string {
  if (totalRows <= 0 || pageSize <= 0) return `0 of 0 rows fetched`
  const first = pageIndex * pageSize + 1
  const last = Math.min((pageIndex + 1) * pageSize, totalRows)
  if (first > totalRows) return `0 of ${totalRows} rows fetched`
  return `${first}\u2013${last} of ${totalRows} rows fetched`
}

/** Page sizes offered when a table opts into a page-size control. */
export const DEFAULT_PAGE_SIZE_CHOICES = [10, 20, 50, 100] as const

/**
 * Coerce a page-size choice (from a `<Select>`) into a permitted value.
 *
 * A hand-edited or unknown value falls back to `fallback` instead of reaching
 * the pagination row model.
 */
export function resolvePageSize(
  raw: unknown,
  choices: readonly number[] = DEFAULT_PAGE_SIZE_CHOICES,
  fallback = choices[0] ?? 10,
): number {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  const truncated = Math.trunc(parsed)
  return choices.includes(truncated) ? truncated : fallback
}

export type RowsSummary = {
  /** `showing 20 rows (limit 20)` — never invents a server total. */
  text: string
  /**
   * `true` when the number of rows fetched equals the requested limit, i.e. the
   * server may have more. Shown as an explicit notice, never as a silent cap.
   */
  truncated: boolean
  /** Copy for the truncation notice, empty when nothing is truncated. */
  notice: string
}

/**
 * The honest footer for a table backed by a **server-side limit**.
 *
 * `limit === null` means the route returns everything it has, so the count is
 * simply the number of rows on screen.
 */
export function rowsSummary(shown: number, limit: number | null): RowsSummary {
  const count = Math.max(0, Math.trunc(Number.isFinite(shown) ? shown : 0))
  if (limit === null || limit <= 0) {
    return { text: `${count} row${count === 1 ? '' : 's'}`, truncated: false, notice: '' }
  }
  const truncated = count >= limit
  return {
    text: `showing ${count} row${count === 1 ? '' : 's'} (limit ${limit})`,
    truncated,
    notice: truncated
      ? `That is exactly the limit — more rows may exist. Raise the limit to see them.`
      : '',
  }
}
