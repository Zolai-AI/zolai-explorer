/**
 * Node-env specs for the shell-owned `/health` poll observer (issue #7).
 *
 * The regression these pin: the 30s loop used to be owned by the pill, which
 * only mounted while the ⋯ menu was open at narrow widths, so `/health` was
 * polled in that window alone. Hoisting the interval into `HealthObserver` —
 * mounted once by the shell — makes the poll width-independent, and the pause
 * (a different subtree) must still stop it.
 *
 * Three working styles, all DOM-free: the option mapping is a pure call
 * (`healthObserverSpec` / `healthDisplaySpec`), the observer renders to empty
 * static markup (it is an observer, not a control), and source guards confirm
 * the interval moved out of the pill/menu and into the shell.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HEALTH_POLL_INTERVAL_MS,
  HealthObserver,
  healthDisplaySpec,
  healthObserverSpec,
} from './HealthObserver'
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

beforeEach(() => {
  __setStorageForTests(fakeStorage())
})

afterEach(() => {
  __setStorageForTests(null)
})

describe('healthObserverSpec — the one poll the shell mounts', () => {
  it('keys the single poll `health`, so a display observer dedupes against it', () => {
    // One `queryKey` is what lets the pill / dashboard share this cache without
    // starting a second request.
    expect(healthObserverSpec(false).queryKey).toEqual(['health'])
    expect(healthObserverSpec(true).queryKey).toEqual(['health'])
  })

  it('maps a pause to refetchInterval: false for the OBSERVER (TanStack’s off value)', () => {
    // The whole point of hoisting: the loop the shell mounted must stop on the
    // pause flag, exactly as the pill's loop used to — `false`, not `0`.
    expect(healthObserverSpec(true).refetchInterval).toBe(false)
  })

  it('keeps the 30s poll when running', () => {
    expect(HEALTH_POLL_INTERVAL_MS).toBe(30_000)
    expect(healthObserverSpec(false).refetchInterval).toBe(30_000)
  })

  it('leaves every other option alone — pausing is not re-scoping the query', () => {
    for (const paused of [true, false] as const) {
      const options = healthObserverSpec(paused)
      expect(options.staleTime).toBe(15_000)
      expect(options.retry).toBe(1)
      expect(typeof options.queryFn).toBe('function')
    }
  })
})

describe('healthDisplaySpec — a subscriber that can never start a second loop', () => {
  it('shares the `health` key but pins the interval off', () => {
    const spec = healthDisplaySpec()
    expect(spec.queryKey).toEqual(['health'])
    // The pill / dashboard read the cache; they must own no timer.
    expect(spec.refetchInterval).toBe(false)
  })
})

describe('HealthObserver — it renders nothing and runs no fetch on a static pass', () => {
  it('emits empty markup (an observer, not a control)', () => {
    __setStorageForTests(fakeStorage(true))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <HealthObserver />
      </QueryClientProvider>,
    )

    // No badge, no button, no interval UI — the pill stays the only indicator.
    expect(html).toBe('')
    expect(html).not.toContain('Pause')
  })
})

describe('the interval moved out of the pill/menu and into the shell', () => {
  const observer = readFileSync(
    fileURLToPath(new URL('./HealthObserver.tsx', import.meta.url)),
    'utf8',
  )
  const pill = readFileSync(fileURLToPath(new URL('./HealthPill.tsx', import.meta.url)), 'utf8')
  const topBar = readFileSync(fileURLToPath(new URL('./TopBar.tsx', import.meta.url)), 'utf8')
  const shell = readFileSync(fileURLToPath(new URL('./AppShell.tsx', import.meta.url)), 'utf8')

  it('the observer is the only file that sets a live refetchInterval', () => {
    expect(observer).toMatch(/refetchInterval:\s*paused\s*\?\s*NO_INTERVAL\s*:\s*HEALTH_POLL_INTERVAL_MS/)
  })

  it('the pill and the ⋯ menu set no refetchInterval at all', () => {
    // The assignment form, not the bare word: `HealthPill.tsx` explains in prose
    // that it pins the interval off, and a guard that matched that comment would
    // forbid the file from describing its own behaviour.
    expect(pill).not.toMatch(/refetchInterval\s*:/)
    expect(topBar).not.toMatch(/refetchInterval\s*:/)
  })

  it('the shell mounts the observer exactly once', () => {
    expect(shell).toMatch(/import \{ HealthObserver \} from '\.\/HealthObserver'/)
    expect(shell.match(/<HealthObserver \/>/g)?.length).toBe(1)
  })

  it('the observer fetches /health key-free via HEALTH_URL (never API_BASE)', () => {
    // AGENTS.md non-negotiable #6: the poll is public and must not carry a
    // credential. A source guard is the honest check in a node render.
    expect(observer).toMatch(/apiGetAbsolute<unknown>\(HEALTH_URL/)
    expect(observer).not.toMatch(/API_BASE/)
    expect(observer).not.toMatch(/apiKey|X-API-Key|Bearer|credentials/)
  })
})
