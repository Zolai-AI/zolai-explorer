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
 *
 * A third pins the width budget (#12): every control in the right cluster is a
 * fixed width, so the cluster's `min-w-0 shrink` bottoms out at their sum — and
 * with six of them the *header* pushed the document 3px wide at viewport 753.
 * The budget comes from the palette trigger, whose fixed inline width duplicates
 * a named entry in the ⋯ menu; no control may reach for a sub-40px target, and
 * the sign-out may not be hidden at a width where it is the session's only route
 * out.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  auth_source: 'anonymous',
  username: null,
} as const

const IDENTIFIED = { ...ANON, role: 'admin', key_prefix: 'sk-abc123' } as const

/**
 * The API-key control, found by the icon it carries.
 *
 * It used to be found by its `title=`, which is exactly the attribute candidate
 * #8 removed: a tooltip is unreachable for keyboard and touch users, so the
 * button now names itself with a visible label above the tier and an `sr-only`
 * companion below. `KeyRound` is only ever rendered here, so the icon is a
 * locator that cannot drift into matching the wrong control.
 */
function keyButtonMarkup(html: string): string {
  const at = html.indexOf('lucide-key-round')
  if (at < 0) throw new Error('the API-key button is missing from the bar')
  const start = html.lastIndexOf('<button', at)
  const end = html.indexOf('</button>', at)
  if (start < 0 || end < 0) throw new Error('the API-key button is not a well-formed element')
  return html.slice(start, end + '</button>'.length)
}

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

  it('renders the ⋯ overflow trigger, retired at the widest tier', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // Present and labelled rather than a bare glyph.
    expect(html).toContain('aria-label="More options"')
    // Hiding is on the wrapper span, never on the button's internals — and it
    // covers everything below the 1020px tier, so the health pill (inline only
    // there) stays reachable while the bar is narrower than it. The tier is a
    // *container* width: at a 1024px viewport the bar is 769px, because the
    // sidebar that appears in the same query has already taken 239px (#12).
    expect(html).toContain('<span class="@min-[1020px]:hidden">')
  })

  it('wraps the health pill so it is hidden below the 1020px tier', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // The pill itself (its tooltip-wrapped badge) must sit inside a
    // `hidden … @min-[1020px]:block` wrapper — the wrapper carries the tier, not
    // the pill. The pill's longest label ("unreachable") is what overflowed
    // the bar at a 1024px viewport, so it only joins the inline row when the bar
    // itself measured 1020. `data-slot="tooltip-trigger"` is the pill's
    // outermost node.
    expect(html).toMatch(
      /<span class="hidden min-w-0 @min-\[1020px\]:block"><span data-slot="tooltip-trigger"/,
    )
  })

  it('wraps the palette trigger so it is hidden below the 820px tier', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // 820px of *bar*, not `md` of viewport: the trigger carries a fixed width at
    // every breakpoint, so it is the one item in the right cluster that could be
    // dropped without losing a control — the ⋯ menu names "Search commands…"
    // whenever the trigger is out. Measured need was 779px inline; at a 768px
    // viewport the bar is 753 and the row overflowed by 3px (#12).
    // The trigger is named by aria-label now, not a native title (#8).
    expect(html).toMatch(
      /<span class="hidden @min-\[820px\]:block"><button[^>]*aria-label="Open the command palette"/,
    )
  })

  it('keeps the theme toggle inline from the 480px tier', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // 40px, so it stays in the bar at the width the trigger left it.
    expect(html).toMatch(
      /<span class="hidden @min-\[480px\]:block"><button[^>]*aria-label="Theme:/,
    )
    // Its current mode is carried by the accessible name, not a tooltip that
    // only a mouse can reach.
    expect(html).not.toContain('title="Theme:')
  })

  it('keeps the sign-in link and API-key button as direct controls', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const html = render()

    // Still a real link to the sign-in route — not a menu-only entry — and still
    // amber because nothing is accepted: the tone is the affordance now that the
    // tooltip that used to say it is gone (#8).
    const link = render()
      .match(/<a[^>]*href="\/login\?from=%2F"[^>]*>/)
      ?.at(0)
    if (typeof link !== 'string') throw new Error('the sign-in control is missing from the bar')
    expect(link).toContain('border-amber-500/50')
    // Still a real button — not buried in the overflow menu.
    expect(keyButtonMarkup(html)).toContain('border-amber-500/50')
    // Labels return at the 820px tier; each control keeps its own sr-only
    // companion for the accessible name at every narrower width — not `title`
    // alone, which no keyboard or touch user can reach.
    expect(html).toMatch(/<span class="hidden @min-\[820px\]:inline">Set API key<\/span>/)
    expect(html).toMatch(
      /<span class="sr-only @min-\[820px\]:hidden">No API key stored — set one<\/span>/,
    )
    expect(html).toMatch(/<span class="hidden min-w-0 truncate @min-\[820px\]:inline">Sign in<\/span>/)
    expect(html).not.toMatch(/<(a|button)[^>]*\stitle="[^"]*key/i)
  })
})

describe('TopBar key control — it names the credential actually in play', () => {
  // The amber "no key" state and its tooltip were driven by `localStorage`
  // alone, so a tab signed in with an account was told it was limited to public
  // endpoints it was already reading. `auth_source` from `/auth/me` is the only
  // authority for which credential won.
  const SESSION = { ...ANON, role: 'member', auth_source: 'session', username: 'member_one' } as const

  it('warns in amber only when no credential of any kind is in play', () => {
    useAuthMeMock.mockReturnValue(ANON)
    const button = keyButtonMarkup(render())

    expect(button).toContain('border-amber-500/50')
    // The name of the action, without a tooltip: label above the 820px tier,
    // `sr-only` under it.
    expect(button).toContain('Set API key')
    expect(button).toContain('No API key stored — set one')
    expect(button).not.toMatch(/\stitle="/)
  })

  it('does not call a session-signed tab a public-endpoints-only tab', () => {
    useAuthMeMock.mockReturnValue(SESSION)
    const html = render()
    const button = keyButtonMarkup(html)

    expect(button).not.toContain('border-amber-500/50')
    // What replaced the tooltip that used to say this: the identity control
    // beside it, on screen for every role.
    expect(html).toContain('Signed in')
    // The sentence that made this a finding: a session user is not limited to
    // public endpoints, so the bar may not say so anywhere.
    expect(html).not.toContain('public endpoints only')
  })
})

/**
 * The health-poll pause (candidate #6). Radix renders menu *content* only while
 * open, so a static pass cannot see the item — this reads the source instead,
 * which is also the only way to assert the toggle is bound to the store rather
 * than to local state.
 */
describe('TopBar ⋯ menu — the health poll can be paused', () => {
  const source = readFileSync(fileURLToPath(new URL('./TopBar.tsx', import.meta.url)), 'utf8')

  it('offers it as a checked item, so the state is readable on open', () => {
    // An action item cannot show whether polling is currently stopped.
    expect(source).toContain('DropdownMenuCheckboxItem')
    expect(source).toMatch(/checked=\{pollPaused\}/)
    expect(source).toMatch(/onCheckedChange=\{\(value\) => setPollPaused\(value\)\}/)
    expect(source).toContain('Pause auto-refresh')
  })

  it('drives the same store the pill reads', () => {
    expect(source).toMatch(/useHealthPollPaused\(\)/)
    expect(source).toMatch(/from '\.\.\/lib\/healthPoll'/)
  })
})

/**
 * Candidate #12, measured in the browser: at viewport 753 the `/data` page
 * reported `scrollWidth 756` and the DOM sweep named exactly one offender — the
 * icon-only Sign out button, `w: 40`, `right: 756`, inside
 * `div.flex min-w-0 shrink items-center gap-1 sm:gap-2`. The cluster yields down
 * to the sum of its fixed-width children and no further, so the *header* drove a
 * page-level horizontal scrollbar at a width where the content fits.
 *
 * The two tempting fixes are both forbidden here, so they are pinned as firmly as
 * the defect: shrinking a control below the 40px target, and hiding the
 * sign-out — below `lg` the bar is the only home a session has. The width comes
 * from the one item that duplicates an entry the ⋯ menu carries
 * unconditionally: the palette trigger and its own fixed widths.
 */
describe('TopBar width budget (#12) — the header never drives a page scroll', () => {
  const source = readFileSync(fileURLToPath(new URL('./TopBar.tsx', import.meta.url)), 'utf8')

  it('keeps the right cluster shrinkable', () => {
    // `min-w-0 shrink`, never `shrink-0` — the group yields, its labels
    // ellipsize; only the controls that must not squash keep their own `shrink-0`.
    expect(source).toMatch(/<div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">/)
  })

  it('moves the fixed-width palette trigger out of the narrow-bar band', () => {
    expect(source).toMatch(
      /<span className="hidden @min-\[820px\]:block">\s*<CommandPaletteTrigger/,
    )
  })

  it('keys every tier to the bar, not to the viewport', () => {
    // The defect (#12) was a media query answering for a width the bar never
    // had: a 1024px viewport leaves the header 769px, because the `lg` sidebar
    // arrives in the same query and the scrollbar gutter is inside `innerWidth`.
    // So the tiers are container variants, and `@container` must be declared by
    // the shell on the column that holds this bar.
    expect(source).toMatch(/@min-\[820px\]:block/)
    expect(source).toMatch(/@min-\[1020px\]:hidden/)
    expect(source).not.toMatch(/<span className="hidden (?:sm|md|lg):block">/)
    const shell = readFileSync(fileURLToPath(new URL('./AppShell.tsx', import.meta.url)), 'utf8')
    expect(shell).toMatch(/className="(@container )?flex min-w-0 flex-1 flex-col"/)
  })

  it('leaves the palette reachable in the ⋯ menu at the widths it left the bar', () => {
    // The menu entry carries no breakpoint class, and the trigger that opens it
    // spans everything below the 1020px tier — so hiding the inline copy strands
    // nothing.
    expect(source).toMatch(
      /<DropdownMenuItem onSelect=\{onOpenPalette\} className="max-lg:min-h-10">\s*<Search aria-hidden \/>\s*Search commands…/,
    )
    expect(source).toMatch(/<span className="@min-\[1020px\]:hidden">\s*<DropdownMenu>/)
  })

  it('never buys the width back with a smaller touch target', () => {
    useAuthMeMock.mockReturnValue(IDENTIFIED)
    const buttons = render().match(/<button[^>]*>/g) ?? []
    // The cluster really was scanned: palette trigger, theme, ⋯, key, sign-out.
    expect(buttons.length).toBeGreaterThan(3)
    // `max-lg:h|w|size-<single digit>` is a sub-40px control; `10` is the floor
    // this repo sets for interactive controls below `lg`.
    expect(buttons.filter((tag) => /max-lg:(?:h|w|size)-\d(?![\d.])/.test(tag))).toEqual([])
  })

  it('keeps sign-out in the bar at every width below lg', () => {
    useAuthMeMock.mockReturnValue(IDENTIFIED)
    const tag = render().match(/<button[^>]*aria-label="Sign out"[^>]*>/)?.[0]
    if (typeof tag !== 'string') throw new Error('the sign-out control is missing from the bar')
    const classes = tag.match(/class="([^"]*)"/)?.[1] ?? ''

    // Exactly one width hides it: `lg` and up, where the sidebar footer shows the
    // labelled button. Anything narrower and an identified operator has no way
    // to end the session from the header.
    expect(classes.split(' ').filter((c) => c.endsWith('hidden'))).toEqual(['lg:hidden'])
    // And the fix is the 40px floor, not a control shrunk to fit.
    expect(classes).toContain('max-lg:h-10')
    expect(classes).toContain('max-lg:w-10')
  })
})
