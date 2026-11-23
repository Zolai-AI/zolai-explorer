/**
 * Layout guard for the app shell (issue #25): on desktop the routed content
 * must span the viewport — the old `max-w-6xl` centred column left unused
 * space on wide displays. Gutters are not the thing being removed: they come
 * from the `<main>` padding and must survive.
 *
 * Rendered through `react-dom/server`; effects (and therefore `localStorage`)
 * never run, so the shell renders its static structure only.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'
import { TooltipProvider } from './ui/tooltip'

function render(ui: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      {/* The shell's TopBar renders tooltips; App.tsx provides the same
          context above the router in the real app. */}
      <TooltipProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('AppShell — the content column spans the desktop viewport', () => {
  const html = render(<AppShell />)

  it('carries no max-width clamp on the routed panel area', () => {
    // The defect: `mx-auto w-full max-w-6xl` centred every page in a 1152px
    // column no matter how wide the display was.
    expect(html).not.toContain('max-w-6xl')
    expect(html).not.toContain('mx-auto w-full')
  })

  it('keeps the content wrapper and its gutters', () => {
    // Removing the clamp must not remove the padding that keeps text off the
    // viewport edge, nor the wrapper that holds AuthBanner + the routed page.
    expect(html).toContain('min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6')
    expect(html).toContain('<div class="w-full">')
  })
})

/**
 * Issue #19: navigating kept the window where the previous page left it, so the
 * new page opened mid-scroll with its `<h1>` behind the sticky bar. Effects do
 * not run under `renderToStaticMarkup`, so this reads the shell source instead.
 */
describe('AppShell — a navigation starts the new page at its top', () => {
  const source = readFileSync(fileURLToPath(new URL('./AppShell.tsx', import.meta.url)), 'utf8')

  it('scrolls the document back to zero', () => {
    expect(source).toMatch(/globalThis\.window\.scrollTo\(\{ top: 0 \}\)/)
  })

  it('keys the reset to the path alone', () => {
    // A query-string change is a control the user moved (a limit, a filter);
    // yanking them to the top on every keystroke is worse than the bug.
    const effect = source.match(
      /useEffect\(\(\) => \{\s*globalThis\.window\.scrollTo\(\{ top: 0 \}\)\s*\}, \[([^\]]*)\]\)/,
    )
    expect(effect?.[1]).toBe('location.pathname')
  })
})

/**
 * Issue #7: the `/health` poll is hoisted into the shell so it runs at every
 * viewport width, and it must still render with **no credential present** (the
 * endpoint is public and key-free — AGENTS.md non-negotiable #6).
 */
describe('AppShell — the shell owns the one health poll, key-free', () => {
  const html = render(<AppShell />)
  const source = readFileSync(fileURLToPath(new URL('./AppShell.tsx', import.meta.url)), 'utf8')

  it('mounts the health observer the poll lives in', () => {
    // The observer renders nothing, so the check is the wiring, not the markup.
    expect(source).toMatch(/<HealthObserver \/>/)
    expect(source).toMatch(/from '\.\/HealthObserver'/)
  })

  it('renders with no credential of any kind present', () => {
    // A key-free anonymous session: no header name, no token, no key value in
    // the emitted static shell.
    expect(html).not.toMatch(/X-API-Key/i)
    expect(html).not.toMatch(/Bearer /)
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{6,}/)
    expect(html).not.toMatch(/Authorization/i)
  })
})
