/**
 * Render guards for the top bar's identity controls, emitted as static markup
 * through `react-dom/server` (no DOM implementation needed).
 *
 * The regression these pin: below `lg` the persistent `<aside>` is hidden and
 * the sidebar footer lives inside the hamburger `<Sheet>`, so sign-out cost two
 * taps to reach on a phone. It had to be reachable from the bar itself.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'
import { TooltipProvider } from './ui/tooltip'

// Identity is the input under test, so it is the thing that gets stubbed.
// `roleBadge` stays real — the badge must still be derived, not faked.
const useAuthMeMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>()
  return { ...actual, useAuthMe: useAuthMeMock }
})

function render(): string {
  // `HealthPill` in the bar runs a query; the provider is there so the health
  // probe stays pending instead of throwing during a static render.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      {/* App.tsx provides this at the root; the bar's own controls rely on it. */}
      <TooltipProvider>
        <MemoryRouter>
          <TopBar onOpenPalette={() => {}} onOpenApiKey={() => {}} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const ANON = {
  role: 'anonymous',
  key_prefix: null,
  scopes: [],
  mode: '',
  auth_source: 'none',
  username: null,
} as const

const IDENTIFIED = { ...ANON, role: 'admin', key_prefix: 'sk-abc123' } as const

describe('TopBar sign-out — the drawer must not be the only route to it', () => {
  it('offers sign-out directly in the bar for an identified user', () => {
    useAuthMeMock.mockReturnValue(IDENTIFIED)
    const html = render()

    // Present, and labelled for what it does rather than for an icon.
    expect(html).toContain('aria-label="Sign out"')
    expect(html).toContain('Sign out')
    // A real button, not a link to somewhere that happens to sign out.
    expect(html).toMatch(/<button[^>]*aria-label="Sign out"/)
  })

  it('hides it from lg up, where the sidebar footer already shows it', () => {
    useAuthMeMock.mockReturnValue(IDENTIFIED)
    const html = render()

    // Without this the bar and the sidebar footer would both carry a
    // sign-out control on a wide screen. Attribute order in the emitted
    // markup follows the JSX, so grab the whole tag before testing it.
    const tag = html.match(/<button[^>]*aria-label="Sign out"[^>]*>/)?.[0]
    expect(tag, 'sign-out button not found in the bar').toBeTruthy()
    expect(tag).toContain('lg:hidden')
  })

  it('renders no sign-out when there is nothing to end', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    expect(html).not.toContain('aria-label="Sign out"')
    // The sign-in path is still there — anonymity is not a dead end.
    expect(html).toContain('Sign in')
  })

  it('keeps the sign-in control visible for an identified user too', () => {
    useAuthMeMock.mockReturnValue(IDENTIFIED)
    const html = render()

    // Signing out must not remove the route to replace or clear a key.
    expect(html).toContain('Signed in')
  })
})
