/**
 * Render guards for the two surfaces users kept reporting as broken: the
 * sign-in form (password field + its eye toggle) and the assistant composer
 * (a usable chatbox that needs no pasted key).
 *
 * These render through `react-dom/server` — no DOM implementation needed — and
 * assert on the emitted markup, so a regression that hides a control (or buries
 * it under other panels) fails the build instead of reaching production.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { Login } from './Login'
import { Assistant } from './Assistant'

function render(ui: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Login — the credential a human actually holds', () => {
  const html = render(<Login />)

  it('leads with the username + password form, not the API-key form', () => {
    expect(html).toContain('id="login-password"')
    expect(html).toContain('id="login-username"')
    // The API-key card is the secondary path and is NOT on screen by default.
    expect(html).not.toContain('id="login-key"')
    expect(html).toContain('Use an API key instead')
  })

  it('renders a show/hide eye toggle wired to the password field', () => {
    // The password input starts masked and the toggle is a real button labelled
    // for the action it performs — both are what "the eye is missing" meant.
    // Attribute order follows the shadcn <Input> (type before id).
    expect(html).toMatch(/type="password"[^>]*id="login-password"/)
    expect(html).toMatch(/type="button"[^>]*aria-label="Show password"/)
    // The icon itself must be in the tree, not just the label.
    expect(html).toContain('lucide-eye')
  })

  it('masks the password by default and never echoes its value', () => {
    expect(html).not.toMatch(/type="text"[^>]*id="login-password"/)
  })
})

describe('Assistant — the chatbox is the page', () => {
  const html = render(<Assistant />)

  it('renders a message box and a Send button above the fold', () => {
    expect(html).toContain('id="assistant-message"')
    expect(html).toContain('<textarea')
    expect(html).toMatch(/type="submit"[^>]*>.*?Send/s)
  })

  it('needs no API key to send: nothing is gated behind a key field', () => {
    // The whole point — an anonymous visitor can chat. A pasted key stays
    // optional and lives behind a collapsed disclosure.
    expect(html).not.toContain('id="assistant-api-key"')
    expect(html).toContain('Provider options')
  })

  it('keeps the provider override collapsed by default', () => {
    expect(html).not.toContain('id="assistant-target-provider"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('does not clip the page into a fixed-height, unscrollable box', () => {
    // `max-h-[calc(100vh-8rem)]` with no scroll container pushed the composer
    // below the fold on short viewports.
    expect(html).not.toContain('calc(100vh-8rem)')
  })

  it('tells the visitor no key is needed', () => {
    expect(html).toMatch(/No key needed/i)
  })
})
