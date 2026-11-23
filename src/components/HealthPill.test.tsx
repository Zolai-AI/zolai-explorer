/**
 * Guards for the health pill and its (now display-only) subscription, in the
 * node environment: the render is static markup (no DOM), and the pause store is
 * driven through its injected storage backend.
 *
 * What they pin: the stopped pill must say so on its face — the tooltip is not
 * rendered at all in a static pass, so a tooltip-only marker would be invisible
 * until hover (WCAG 1.4.13). The `refetchInterval: false` mapping the pause
 * depends on moved to the shell-owned observer (`HealthObserver.test.tsx`); the
 * pill itself no longer owns any timer, which a source guard below enforces.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HealthPill } from './HealthPill'
import { TooltipProvider } from './ui/tooltip'
import { HEALTH_POLL_PAUSED_STORAGE_KEY, __setStorageForTests } from '../lib/healthPoll'
import type { StorageLike } from '../lib/key'

function fakeStorage(paused = false): StorageLike {
  const mem = new Map<string, string>()
  if (paused) mem.set(HEALTH_POLL_PAUSED_STORAGE_KEY, 'true')
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

function renderPill(): string {
  // The provider keeps the health probe pending through a static render —
  // effects never run, so nothing reaches out to the API.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <HealthPill />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  __setStorageForTests(fakeStorage())
})

afterEach(() => {
  __setStorageForTests(null)
})

describe('HealthPill — it is a display observer, not the poll', () => {
  const source = readFileSync(fileURLToPath(new URL('./HealthPill.tsx', import.meta.url)), 'utf8')

  it('owns no interval of its own (the timer lives in the shell observer)', () => {
    // Hoisting the poll into the shell means the pill must not set a live
    // `refetchInterval` or carry the fetch — a second interval would start a
    // second loop. (The pill keeps its own `AGE_TICK_MS` render cadence, which
    // is not a poll, and the fetch now lives entirely in `HealthObserver`.)
    // The assignment form again — the pill's own doc comment explains in prose
    // that it pins the interval off, and matching that word would forbid the
    // file from describing its behaviour.
    expect(source).not.toMatch(/refetchInterval\s*:/)
    expect(source).not.toMatch(/POLL_INTERVAL_MS/)
    expect(source).not.toMatch(/apiGetAbsolute/)
    expect(source).toMatch(/healthDisplaySpec/)
    expect(source).toMatch(/from '\.\/HealthObserver'/)
  })
})

describe('HealthPill — a stopped poll says so on the pill', () => {
  it('marks the paused state in the badge text, not only in a tooltip', () => {
    __setStorageForTests(fakeStorage(true))
    const html = renderPill()

    // The label is the whole visible statement, and it is short: the pill sits
    // inline from `lg`, where a long mono label would push the bar over.
    expect(html).toMatch(/<span class="font-mono whitespace-nowrap">paused<\/span>/)
    expect(html).not.toContain('checking')
    // The ping is a liveness cue, so a stopped poll must not animate.
    expect(html).not.toContain('animate-ping')
  })

  it('renders no pause marker while the poll is running', () => {
    const html = renderPill()

    // A static render never resolves a query, so the running pill is the
    // loading face: spinner, no ping dot yet, and no pause word.
    expect(html).toContain('>checking<')
    expect(html).toContain('animate-spin')
    expect(html).not.toContain('>paused<')
    expect(html).not.toContain('Pause')
  })
})
