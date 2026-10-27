/**
 * Render guards for the sidebar (issue #7): primary navigation must expose
 * route destinations as **links** — one focusable anchor per item, no
 * `<button>` nested inside an `<a>` — and the sidebar's "Search" item must
 * not collide with the search form's submit control for the same accessible
 * name (WCAG 4.1.1 / 1.3.1).
 *
 * Rendered through `react-dom/server`, asserting on the emitted markup.
 * Expected destinations come from the route registry, so this fails when the
 * sidebar and the registry drift apart rather than when a path changes.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { can } from '../lib/auth'
import { NAV_ROUTES } from '../lib/routes'
import { Search } from '../routes/Search'
import { Sidebar } from './Sidebar'

function render(ui: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Every opening anchor tag in the markup. */
function anchors(html: string): string[] {
  return html.match(/<a\b[^>]*>/g) ?? []
}

describe('Sidebar — route nav is link semantics', () => {
  const html = render(<Sidebar />)
  // Exactly what the component renders: registry nav routes an anonymous
  // visitor may pass (`/agent`, `/settings` are role-gated out of the list).
  const navRoutes = NAV_ROUTES.filter(
    (route) => route.nav && can('anonymous', route.minRole),
  )

  it('renders every visible primary nav destination as a real <a href>', () => {
    // Registry-derived: adding a nav route to routes.ts extends this list, so
    // a hand-typed sidebar can never satisfy it with buttons.
    expect(navRoutes.length).toBeGreaterThan(3)
    for (const route of navRoutes) {
      expect(html).toContain(`href="${route.path}"`)
    }
    expect(anchors(html).length).toBeGreaterThanOrEqual(navRoutes.length)
  })

  it('never nests a button inside a link', () => {
    // The pre-fix markup was `<a><button …>label</button></a>` — two
    // focusable controls in one, announced as a button. Each anchor must
    // close with no `<button>` between its tags.
    const anchorBlocks = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []
    expect(anchorBlocks.length).toBeGreaterThanOrEqual(navRoutes.length)
    for (const block of anchorBlocks) {
      expect(block).not.toContain('<button')
    }
  })

  it('keeps the label visible and named in the collapsed icon rail', () => {
    const collapsed = render(<Sidebar collapsed />)
    // Icon-only mode hides the text, so the anchor itself must carry the
    // accessible name — otherwise the rail renders nameless links.
    const searchRoute = navRoutes.find((route) => route.id === 'search')
    expect(searchRoute).toBeDefined()
    expect(collapsed).toContain(`aria-label="${searchRoute?.label}"`)
    expect(collapsed).toContain('aria-label="Dashboard"')
  })
})

describe('accessible names — the sidebar and the search form do not collide', () => {
  const both = render(
    <>
      <Sidebar />
      <Search />
    </>,
  )

  it('keeps exactly one element named exactly "Search" (the nav link)', () => {
    // Every element whose whole text content is `Search` — one, from the
    // registry label. Two would put a nav link and a control in competition
    // for the same announced name.
    expect((both.match(/>Search<\//g) ?? [])).toHaveLength(1)
    expect(both).toContain('<span class="truncate">Search</span>')
  })

  it('names the form submit for its action, not for the route', () => {
    expect(both).toMatch(/type="submit">Run search</)
    expect(both).not.toMatch(/<button[^>]*>Search</)
  })
})
