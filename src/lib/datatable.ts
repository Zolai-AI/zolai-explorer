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
 * The Tailwind 4 default `min-width` (in rem) at which a `hideBelow` tier
 * reveals its column: `sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem.
 *
 * These two maps are **one contract with two halves** — `HIDE_BELOW_CLASS` is
 * the CSS that hides/reveals a cell, and `HIDE_BELOW_QUERY` is the media query
 * a runtime check asks to know whether that same CSS is currently hiding it.
 * They are keyed off this single breakpoint table so a value cannot drift
 * between the class and the query (which would make the footer lie about which
 * columns are off-screen). No `rem` number is written anywhere else.
 */
export const HIDE_BELOW_MIN_WIDTH_REM = {
  sm: 40,
  md: 48,
  lg: 64,
  xl: 80,
} as const satisfies Record<HideBelow, number>

/** The `(min-width: …)` media query that reveals a `hideBelow` tier. */
export const HIDE_BELOW_QUERY: Record<HideBelow, string> = {
  sm: `(min-width: ${HIDE_BELOW_MIN_WIDTH_REM.sm}rem)`,
  md: `(min-width: ${HIDE_BELOW_MIN_WIDTH_REM.md}rem)`,
  lg: `(min-width: ${HIDE_BELOW_MIN_WIDTH_REM.lg}rem)`,
  xl: `(min-width: ${HIDE_BELOW_MIN_WIDTH_REM.xl}rem)`,
}

/** The `hideBelow` tiers, ordered smallest → largest breakpoint. */
export const HIDE_BELOW_TIERS: readonly HideBelow[] = ['sm', 'md', 'lg', 'xl']

/**
 * The tiers a viewport of `widthRem` is currently clipping: a column marked
 * `hideBelow: T` is off-screen while the viewport is under T's breakpoint.
 *
 * Pure, so the breakpoint arithmetic is unit tested in plain Node. The
 * component derives the same answer live from `matchMedia` (against
 * `HIDE_BELOW_QUERY`) so it tracks the browser's real viewport, including zoom.
 */
export function hiddenTiersAtWidth(widthRem: number): HideBelow[] {
  return HIDE_BELOW_TIERS.filter((tier) => widthRem < HIDE_BELOW_MIN_WIDTH_REM[tier])
}

/** The shape `hiddenColumnsAt` reads off a caller's column list. */
export type HiddenColumnSpec = {
  key: string
  /** A header the caller passed. It is a ReactNode, so never assume a string. */
  header: unknown
  hideBelow?: HideBelow
}

/** Cap on how many hidden columns the marker names before collapsing to "+N more". */
export const HIDDEN_COLUMN_LABEL_LIMIT = 3

/** A hidden-column finding, ready for the footer. */
export type HiddenColumns = {
  /** Total `hideBelow` columns off-screen at this width. */
  count: number
  /** Up to `HIDDEN_COLUMN_LABEL_LIMIT` labels, in spec order. */
  labels: string[]
  /** Hidden columns beyond the named ones (`count - labels.length`). */
  more: number
  /** The footer sentence, or `''` when nothing is hidden. */
  text: string
}

/**
 * A hidden column's label: its header when that is a string, else its key. The
 * key is always a string the caller supplied, so a ReactNode header (a badge,
 * a sort-icon wrapper) can never print as `[object Object]` in the footer.
 */
function hiddenColumnLabel(spec: HiddenColumnSpec): string {
  return typeof spec.header === 'string' ? spec.header : spec.key
}

/**
 * Which of a caller's columns are off-screen at the current width, given an
 * `isHidden` answer per breakpoint tier.
 *
 * The hidden-set is an **input** (this never calls `matchMedia`) so a node spec
 * can drive it. The copy says **hidden at this width** — the data is in the
 * payload and the endpoint returns it, only the viewport is clipping it — so it
 * must never read as "unavailable", "not returned" or "no data". It names only
 * labels the caller's specs carry, and caps the list so five hidden columns
 * cannot produce a paragraph (the remainder collapses to `(+N more)`).
 */
export function hiddenColumnsAt(
  specs: readonly HiddenColumnSpec[],
  isHidden: (tier: HideBelow) => boolean,
): HiddenColumns {
  const named: string[] = []
  for (const spec of specs) {
    if (spec.hideBelow && isHidden(spec.hideBelow)) named.push(hiddenColumnLabel(spec))
  }
  const count = named.length
  if (count === 0) return { count: 0, labels: [], more: 0, text: '' }
  const labels = named.slice(0, HIDDEN_COLUMN_LABEL_LIMIT)
  const more = count - labels.length
  const head = `${count} column${count === 1 ? '' : 's'} hidden at this width: ${labels.join(', ')}`
  return { count, labels, more, text: more > 0 ? `${head} (+${more} more)` : head }
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
 * How a truncated table can reach the rows it did not get — which decides what
 * the truncation notice is allowed to *tell the user to do*.
 *
 * - `limit` — the page offers a limit control, so raising it is a real action;
 * - `cursor` — more rows come from the next page, never from a bigger limit;
 * - `none` — nothing on this surface fetches more, so say only that the cap
 *   was reached. Advising "raise the limit" here (as an earlier copy did on the
 *   cursor-paginated review queue) is a footer instructing an action that does
 *   not exist.
 */
export type RowsReach = 'limit' | 'cursor' | 'none'

const TRUNCATION_NOTICE: Record<RowsReach, string> = {
  limit: 'That is exactly the limit — more rows may exist. Raise the limit to see them.',
  cursor: 'That is exactly the limit — more rows may exist. Load the next page to see them.',
  none: 'That is exactly the limit — the fetch stopped here, and more rows may exist beyond these.',
}

/**
 * The honest footer for a table backed by a **server-side limit**.
 *
 * `shown` is how many rows are on screen, `fetched` is how many the server
 * actually returned. They differ whenever the table also paginates on the
 * client, and conflating them is how a table ends up claiming "showing 20
 * rows" while ten are visible.
 *
 * `limit === null` means the route returns everything it has, so the count is
 * simply the number of rows on screen.
 */
export function rowsSummary(
  shown: number,
  limit: number | null,
  fetched: number = shown,
  reach: RowsReach = 'none',
): RowsSummary {
  const count = Math.max(0, Math.trunc(Number.isFinite(shown) ? shown : 0))
  const total = Math.max(0, Math.trunc(Number.isFinite(fetched) ? fetched : count))
  if (limit === null || limit <= 0) {
    if (count === total) {
      return { text: `${count} row${count === 1 ? '' : 's'}`, truncated: false, notice: '' }
    }
    return {
      text: `showing ${count} of ${total} rows fetched`,
      truncated: false,
      notice: '',
    }
  }
  const truncated = total >= limit
  const head = count === total ? `showing ${count} row${count === 1 ? '' : 's'}` : `showing ${count} of ${total} rows fetched`
  return {
    text: `${head} (limit ${limit})`,
    truncated,
    notice: truncated ? TRUNCATION_NOTICE[reach] : '',
  }
}
