import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RECORDS_WHITELIST } from '../features/review/api'
import { REVIEW_TABS } from '../lib/routes'
import { recordsColumnTier } from './Review'

/**
 * The review queue's URL-driven state, applied-filter chips, honest count, and
 * records column tiers are pinned here as **source** guards. The page needs a
 * router (`useSearchParams`), two queries and a role, none of which a static
 * render can mount in the node environment — so the wiring is read off the file,
 * the way `Data.test.tsx` pins its own chip row.
 *
 * The row disclosure itself lives in `src/components/TruncatedValue.tsx` and is
 * pinned by `TruncatedValue.test.tsx`; what remains here is the queue's contract.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('./Review.tsx', import.meta.url)), 'utf8')

/** `Review.tsx` with its comments stripped: prose must neither fail nor satisfy a code guard. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('records columns grade across the shared tiers (candidate #13)', () => {
  it('keeps the first data column at every width and drops each later one a tier', () => {
    expect(recordsColumnTier(0)).toBeUndefined()
    expect(recordsColumnTier(1)).toBe('sm')
    expect(recordsColumnTier(2)).toBe('md')
    expect(recordsColumnTier(3)).toBe('lg')
    expect(recordsColumnTier(4)).toBe('xl')
    // Past the fourth the ladder caps — a fifth column cannot invent a tier.
    expect(recordsColumnTier(5)).toBe('xl')
    expect(recordsColumnTier(9)).toBe('xl')
  })

  it('is a graded ladder, not the single `md` cliff it replaced', () => {
    const tiers = [0, 1, 2, 3, 4, 5, 6].map(recordsColumnTier).filter((t) => t !== undefined)
    // More than one distinct breakpoint means the columns no longer share one edge.
    expect(new Set(tiers).size).toBeGreaterThan(1)
    // The page must not hand back the old flat cliff, and grades through the helper.
    expect(CODE).not.toMatch(/hideBelow:\s*key === columnKeys\[0\]\s*\?\s*undefined\s*:\s*'md'/)
    expect(CODE).toContain('recordsColumnTier(index)')
  })

  it('lets DataTable announce the off-screen columns rather than duplicating the marker', () => {
    // The hidden-column footer is `DataTable`'s job (hiddenColumnsAt); a bespoke
    // one on this page would be a second truth that drifts.
    expect(CODE).not.toContain('hiddenColumnsAt')
  })
})

describe('Review queue derives its state from the URL (source guard)', () => {
  it('no longer seeds the tab, the table or the filter from local state', () => {
    expect(CODE).not.toContain('useState<ReviewTab>')
    expect(CODE).not.toContain('useState<TableName>')
    expect(CODE).not.toMatch(/\[activeTab,\s*setActiveTab\]\s*=\s*useState/)
    expect(CODE).not.toMatch(/\[selectedTable,\s*setSelectedTable\]\s*=\s*useState/)
    expect(CODE).not.toMatch(/\[searchQuery,\s*setSearchQuery\]\s*=\s*useState/)
    // The tab union lives in the registry now, not re-typed beside the panel.
    expect(CODE).not.toMatch(/type ReviewTab\s*=/)
    // Iterated over the registry's own tab set, so a tab added to `REVIEW_TABS`
    // is covered here without this guard being edited.
    for (const tab of REVIEW_TABS) {
      expect(CODE, tab).not.toMatch(new RegExp(`useState\\(\\s*'${tab}'\\s*\\)`))
    }
    // The filter box is the URL's `q` and writes back through the codec.
    expect(CODE).toContain('value={searchQuery}')
    expect(CODE).toContain('onChange={(event) => setSearchQuery(event.target.value)}')
  })

  it('names no whitelisted table by hand — the default comes from the registry', () => {
    // A second copy of `dictionary` in the page is a second truth: it would keep
    // working when the server's whitelist changes, silently.
    for (const table of RECORDS_WHITELIST) {
      expect(CODE, table).not.toContain(`'${table}'`)
    }
    expect(CODE).toContain('DEFAULT_REVIEW_TABLE')
    expect(CODE).toContain('WHITELISTED_TABLES.map')
  })

  it('reads through the codec and writes back with replace, not push', () => {
    expect(CODE).toContain('useSearchParams(')
    expect(CODE).toContain('reviewPanelFromSearch(')
    expect(CODE).toContain('reviewSearch(')
    expect(CODE).toContain('replace: true')
    // Every default is the registry's, applied as the page's own fallback.
    expect(CODE).toContain('panel.tab ?? DEFAULT_REVIEW_TAB')
    expect(CODE).toContain('panel.table ?? DEFAULT_REVIEW_TABLE')
    expect(CODE).toContain('Record<ReviewTab, string>')
  })

  it('titles the tabs from one map, so the chip and the trigger cannot disagree', () => {
    expect(CODE).toContain('{TAB_LABELS.browse}')
    expect(CODE).toContain('{TAB_LABELS.audit}')
    expect(CODE).toContain('value={DEFAULT_REVIEW_TAB}')
    // The tab label spelled out in the trigger markup is the second copy this
    // replaces — `REVIEW_TABS` and `TAB_LABELS` are then the only two places.
    expect(CODE).not.toMatch(/>\s*Audit log\s*</)
    expect(CODE).not.toMatch(/>\s*Browse\s*</)
  })

  it('keeps the cursor stack out of the URL, and says why', () => {
    // Paging is a position into live rows: `WHERE id > ?` cannot be pasted.
    expect(SOURCE).toContain('not in the URL')
    expect(SOURCE).toContain('WHERE id > ?')
    expect(CODE).toContain('useState<number[]>([])')
    // And the codec is never handed a cursor, so it cannot leak into the link.
    expect(CODE).not.toMatch(/reviewSearch\(\s*\{[^}]*cursor/)
  })

  it('replaces the path-mixed heading with applied-filter chips', () => {
    expect(CODE).toContain("from '../components/FilterChips'")
    expect(CODE).toContain('<FilterChips')
    // The old copy spelled the request into the panel heading, blurring applied
    // state with the request that was made.
    expect(CODE).not.toContain('GET /records?table=')
    expect(CODE).not.toContain('GET /audit?table=')
  })

  it('keeps the request path where a request path belongs', () => {
    expect(CODE).toContain('GET /records')
    expect(CODE).toContain('GET /audit')
    expect(CODE).toMatch(/subtitle=\{?["`']GET \/records|subtitle=\{`GET \/records/)
    expect(CODE).toMatch(/subtitle=\{?["`']GET \/audit|subtitle=\{`GET \/audit/)
    // The path must never hide in a native tooltip instead (WCAG 1.4.13 — a
    // `title=` on an element is unreachable by keyboard and gone on blur). A
    // `title` **prop** on `Card` / `Empty` / `PageHeader` is visible text and is
    // how every panel in the app is titled, so only the attribute is banned.
    expect(CODE).not.toMatch(/<(?:span|div|p|code|kbd|svg|input)\b[^>]*\stitle=/i)
  })

  it('offers a ✕ only where the page has the setter, and none at its default', () => {
    // The table is settable by the selector on this page, the filter clears to
    // empty — but a chip already at its default has nothing to remove.
    expect(CODE).toContain('onRemove: () => setSelectedTable(DEFAULT_REVIEW_TABLE)')
    expect(CODE).toContain("onRemove: () => setSearchQuery('')")
    expect(CODE).toContain('onRemove: () => setActiveTab(DEFAULT_REVIEW_TAB)')
    expect(CODE).toMatch(/selectedTable === DEFAULT_REVIEW_TABLE\s*\?\s*\{\}\s*:/)
  })

  it('never lets "clear all" drop the table the API requires', () => {
    expect(CODE).toContain('onClearAll={clearAll}')
    // Reset to the default table, not to nothing: `records.list` needs one.
    expect(CODE).toContain(
      "writePanel({ tab: DEFAULT_REVIEW_TAB, table: DEFAULT_REVIEW_TABLE, q: '' })",
    )
  })

  it('states the count from the payload and never as a total', () => {
    expect(CODE).toContain('formatCount(counted)')
    // `/review/stats` does not exist on the versioned API and the queue is
    // cursor-paginated, so no "of N rows" may appear anywhere.
    expect(CODE).not.toMatch(/of \$\{formatCount\(/)
    expect(CODE).not.toContain('rows total')
  })

  it('points the empty state at the chip’s ✕ instead of a control that is not there', () => {
    expect(CODE).toContain('Remove the filter with its ✕')
    expect(CODE).toContain('The Table chip’s ✕ above')
  })
})
