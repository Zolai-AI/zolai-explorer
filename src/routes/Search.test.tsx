/**
 * Render guard for the corpus search form: the submit control must be held
 * back until there is something to send (issue #4) while keeping the
 * Enter-to-submit path intact.
 *
 * Rendered through `react-dom/server` — no DOM implementation — so the
 * interaction itself is covered by the pure `searchSubmitDisabled` rule
 * below and the markup test pins the default (query prefilled, enabled)
 * state plus the wiring the browser needs for implicit submission.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS_BY_ID, publicPath } from '../lib/endpoints'
import { searchSubmitDisabled, submitSearch } from '../lib/forms'
import { Search } from './Search'

/** Comment-stripped source: prose must neither fail nor satisfy a code guard. */
const CODE = readFileSync(fileURLToPath(new URL('./Search.tsx', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

function render(ui: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The `<button type="submit">` opening tag, or null when it is missing. */
function submitTag(html: string): string | null {
  return html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? null
}

describe('searchSubmitDisabled — nothing to send means nothing to click', () => {
  it('holds the control back while the query is empty or whitespace', () => {
    expect(searchSubmitDisabled('', false)).toBe(true)
    expect(searchSubmitDisabled('   ', false)).toBe(true)
    expect(searchSubmitDisabled(undefined, false)).toBe(true)
    expect(searchSubmitDisabled(null, false)).toBe(true)
  })

  it('re-enables the moment the query carries text', () => {
    expect(searchSubmitDisabled('pasian', false)).toBe(false)
    expect(searchSubmitDisabled('  gam  ', false)).toBe(false)
  })

  it('holds the control while a search is already in flight', () => {
    expect(searchSubmitDisabled('pasian', true)).toBe(true)
  })
})

describe('Search — the form the keyboard drives', () => {
  const html = render(<Search />)

  it('renders a submit button that is enabled with the prefilled query', () => {
    const tag = submitTag(html)
    expect(tag).not.toBeNull()
    // The default query is non-empty, so the control starts actionable —
    // a `disabled` *attribute* here would mean the prefilled state regressed.
    // (The class list legitimately contains `disabled:` opacity utilities.)
    expect(tag).not.toMatch(/\sdisabled[=>]/)
  })

  it('keeps Enter-to-submit: a real form, a real field, a real submit button', () => {
    // Implicit submission needs all three; dropping any of them (or disabling
    // the button while text is present) breaks Enter in the query field.
    expect(html).toMatch(/<form[^>]*noValidate/)
    expect(html).toContain('id="search-query"')
    expect(submitTag(html)).not.toBeNull()
    // The field sits inside the form that owns the submit button.
    const form = html.match(/<form[\s\S]*?<\/form>/)?.[0] ?? ''
    expect(form).toContain('id="search-query"')
    expect(form).toContain('type="submit"')
  })

  it('client-validates before the mutation can run (min 2 characters)', () => {
    // One character is not whitespace-only, so the button is enabled — the
    // zod-backed `submitSearch` is what must stop it before POST /search.
    expect(searchSubmitDisabled('a', false)).toBe(false)
    expect(submitSearch({ query: 'a', limit: '10' }).ok).toBe(false)
    expect(submitSearch({ query: 'pa', limit: '10' }).ok).toBe(true)
  })
})

/**
 * Candidate #10 — the Search empties name the address they asked.
 *
 * "No search yet" and "No matches" used to describe the action but never the
 * endpoint. The rule for an empty panel in this app: name the endpoint
 * (`/api/v1/search`) and the single control that changes the answer, without
 * inventing a total the bare-array response never returned.
 */
describe('Search empties name their endpoint', () => {
  const rendered = render(<Search />)

  it('the versioned path the copy interpolates is /api/v1/search', () => {
    expect(publicPath(ENDPOINTS_BY_ID['search.query'])).toBe('/api/v1/search')
  })

  it('the no-search-yet empty names the endpoint and the submit control', () => {
    // Initial render (no data, not pending, no error) is the empty branch.
    expect(rendered).toContain('No search yet')
    expect(rendered).toContain('POST /api/v1/search')
    expect(rendered).toContain('Use Run search above')
  })

  it('the no-matches empty names the endpoint and never advises raising the limit', () => {
    // A 0-row result cannot become non-empty by raising the limit, so the copy
    // must not offer it — and it must not hand-spell a total the server never
    // returned. Pinned against the source because `search.data` cannot be forced
    // in a static render.
    expect(CODE).toContain('No matches')
    expect(CODE).toContain('POST ${SEARCH_PATH} matched no rows')
    expect(CODE).not.toMatch(/raise the limit/i)
    expect(CODE).not.toMatch(/of \d+ rows/)
    expect(CODE).not.toMatch(/of \$\{[^}]*\} rows/)
  })
})
