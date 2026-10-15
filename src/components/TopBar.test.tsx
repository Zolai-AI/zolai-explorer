/**
 * Render guards for the top bar's identity controls, emitted as static markup
 * through `react-dom/server` (no DOM implementation needed).
 *
 * The regression these pin: below `lg` the persistent `<aside>` is hidden and
 * the sidebar footer lives inside the hamburger `<Sheet>`, so sign-out cost two
 * taps to reach on a phone. It had to be reachable from the bar itself.
 *
 * A second family pins the responsive tiering: the bar is logo-only below `sm`
 * (no `>Z<` glyph), extras collapse into the ⋯ overflow menu, and hiding
 * happens on wrapper spans so component internals stay breakpoint-free.
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

describe('TopBar responsive tiers — logo-only brand, extras in an overflow menu', () => {
  it('shows the logo image as the brand and no "Z" glyph', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    expect(html).toContain('src="/logo.png"')
    expect(html).toContain('alt="Zolai Explorer"')
    // The letter-in-a-box placeholder is gone; the logo carries the brand.
    expect(html).not.toMatch(/>Z</)
  })

  it('collapses the wordmark below sm', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    expect(html).toMatch(
      /<span class="hidden[^"]*sm:inline[^"]*">Zolai Explorer<\/span>/,
    )
  })

  it('renders the ⋯ overflow trigger, hidden from md up', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // Present and labelled rather than a bare glyph.
    expect(html).toContain('aria-label="More options"')
    // Hiding is on the wrapper span, never on the button's internals — and it
    // covers everything below `md`, so the health pill (inline only from `md`)
    // stays reachable in the `sm`–`md` band.
    expect(html).toContain('<span class="md:hidden">')
  })

  it('wraps the health pill so it is hidden below md', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // The pill itself (its tooltip-wrapped badge) must sit inside a
    // `hidden md:block` wrapper — the wrapper carries the breakpoint, not
    // the pill. `data-slot="tooltip-trigger"` is the pill's outermost node.
    expect(html).toMatch(/<span class="hidden md:block"><span data-slot="tooltip-trigger"/)
  })

  it('wraps the palette trigger so it is hidden below sm', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    expect(html).toMatch(
      /<span class="hidden sm:block"><button[^>]*title="Command palette/,
    )
  })

  it('keeps the sign-in link and API-key button as direct controls', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // Still a real link to the sign-in route — not a menu-only entry.
    expect(html).toMatch(/<a[^>]*title="No API key recognised/)
    // Still a real button — not buried in the overflow menu.
    expect(html).toMatch(/<button[^>]*title="No API key — public endpoints only"/)
    // Labels return at md; the sr-only companion covers the accessible name
    // at every narrower width.
    expect(html).toContain('sr-only md:hidden')
    expect(html).toMatch(/<span class="hidden md:inline">Set API key<\/span>/)
  })
})
