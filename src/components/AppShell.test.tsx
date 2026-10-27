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
