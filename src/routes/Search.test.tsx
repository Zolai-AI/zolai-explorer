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
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { searchSubmitDisabled, submitSearch } from '../lib/forms'
import { Search } from './Search'

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
