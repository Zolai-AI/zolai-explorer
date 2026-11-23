/**
 * The hidden-column marker, in the node environment.
 *
 * A static render cannot measure a viewport, so the reactive layer must fall
 * back to the all-visible default. These specs pin that a `renderToStaticMarkup`
 * of a table with `hideBelow` columns (the riskiest part — `matchMedia` cannot
 * run here) **neither throws nor invents** a "columns hidden" notice for a width
 * it cannot see. The marker sentence itself is unit tested at the source in
 * `datatable.test.ts`; the honesty rule (says "hidden at this width", never
 * "unavailable"/"no data") and the ban on a native `title` (WCAG 1.4.13) are
 * checked here against the component and its markup.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataTable, type Column } from './DataTable'

const SOURCE = readFileSync(fileURLToPath(new URL('./DataTable.tsx', import.meta.url)), 'utf8')

type Row = { name: string; notes: string }

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name },
  { key: 'notes', header: 'Notes', cell: (row) => row.notes, hideBelow: 'md' },
]
const rows: Row[] = [{ name: 'pasian', notes: 'an example row' }]

const html = renderToStaticMarkup(
  <DataTable columns={columns} rows={rows} rowKey={(row) => row.name} serverLimit={10} />,
)

describe('DataTable hidden-column marker under a static render', () => {
  it('renders without throwing and never invents a hidden-column notice', () => {
    // No viewport on a static render → the all-visible server snapshot → no marker.
    expect(html).toContain('Name')
    expect(html).not.toContain('hidden at this width')
  })

  it('never reaches for a native tooltip (WCAG 1.4.13)', () => {
    expect(html).not.toMatch(/\stitle=/)
  })
})

describe('DataTable hidden-column reactive layer', () => {
  it('drives the marker from the shared breakpoint queries via a guarded external store', () => {
    expect(SOURCE).toContain('useSyncExternalStore')
    expect(SOURCE).toContain('HIDE_BELOW_QUERY')
    expect(SOURCE).toContain('hiddenColumnsAt')
    // matchMedia lives in the component only — the pure helper stays node-safe.
    expect(SOURCE).toContain('matchMedia')
  })

  it('keeps its copy a statement about the viewport, never a claim the data is absent', () => {
    expect(SOURCE).not.toMatch(/unavailable|no data|not returned/)
  })
})
