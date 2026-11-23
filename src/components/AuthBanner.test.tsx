/**
 * The auth-mode banner's dismissal kernel, in the node environment.
 *
 * The bug these specs exist for is a crash: `AuthBanner` once read
 * `sessionStorage.getItem(...)` straight from a `useState` initializer, which
 * threw the whole shell out of `renderToStaticMarkup` (no `sessionStorage`
 * here) and would do the same in a browser with storage blocked. So the read
 * and write take a `StorageLike` and swallow everything, and the mute decision
 * is a named function rather than an inline comparison — because "dismissing it
 * in warn mode must not silence it forever" is a promise the prose made and the
 * code did not keep.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  bannerMuted,
  readDismissedMode,
  writeDismissedMode,
} from './AuthBanner'
import type { StorageLike } from '../lib/key'

const KEY = 'zolai.authBannerDismissedMode'

/** A store that behaves, a store that is blocked, and no store at all. */
function memoryStore(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    },
  }
}

const blocked = (): StorageLike => ({
  getItem: () => {
    throw new Error('SecurityError: storage is blocked')
  },
  setItem: () => {
    throw new Error('SecurityError: storage is blocked')
  },
  removeItem: () => {
    throw new Error('SecurityError: storage is blocked')
  },
})

describe('readDismissedMode — it cannot throw, whatever the store does', () => {
  it('answers null when there is no store at all (the static-render case)', () => {
    expect(readDismissedMode(undefined)).toBeNull()
    expect(readDismissedMode(null)).toBeNull()
  })

  it('answers null for a store that throws on read', () => {
    expect(readDismissedMode(blocked())).toBeNull()
  })

  it('answers null for a missing, empty, or foreign value — never a mode', () => {
    expect(readDismissedMode(memoryStore())).toBeNull()
    expect(readDismissedMode(memoryStore({ [KEY]: '' }))).toBeNull()
    // A value written by something else under this slot must not mute the notice.
    expect(readDismissedMode(memoryStore({ other: 'warn' }))).toBeNull()
  })

  it('reads back the mode it was given', () => {
    expect(readDismissedMode(memoryStore({ [KEY]: 'warn' }))).toBe('warn')
  })
})

describe('writeDismissedMode — a blocked store costs persistence, not the tab', () => {
  it('stores the mode under the dismissal slot', () => {
    const store = memoryStore()
    writeDismissedMode(store, 'warn')
    expect(store.data[KEY]).toBe('warn')
    expect(readDismissedMode(store)).toBe('warn')
  })

  it('does not throw on a blocked or absent store', () => {
    expect(() => writeDismissedMode(blocked(), 'warn')).not.toThrow()
    expect(() => writeDismissedMode(undefined, 'warn')).not.toThrow()
    expect(() => writeDismissedMode(null, 'warn')).not.toThrow()
  })
})

describe('bannerMuted — the stored mode, not a blanket flag', () => {
  it('mutes only the mode that was dismissed', () => {
    expect(bannerMuted('warn', 'warn')).toBe(true)
  })

  it('re-shows after the deployment flips and comes back', () => {
    // Dismissed under `warn`; the server moved to `enforce` and returned with a
    // different notice shape. A stored `warn` says nothing about a later mode.
    expect(bannerMuted('warn', 'enforce')).toBe(false)
    expect(bannerMuted('warn', 'off')).toBe(false)
  })

  it('never mutes when nothing was stored', () => {
    expect(bannerMuted(null, 'warn')).toBe(false)
    expect(bannerMuted(null, '')).toBe(false)
  })
})

describe('AuthBanner keeps the kernel off the raw global', () => {
  const source = readFileSync(fileURLToPath(new URL('./AuthBanner.tsx', import.meta.url)), 'utf8')

  it('reaches sessionStorage only through the guarded accessor', () => {
    // The initializer goes through the kernel, and the raw global is touched in
    // exactly one place (`sessionStorageLike`, which is try-wrapped). Any second
    // site is a new unguarded read waiting to take the shell down.
    expect(source).toContain('readDismissedMode(sessionStorageLike())')
    expect(source).toContain('writeDismissedMode(sessionStorageLike(), me.mode)')
    expect(source.match(/globalThis\.sessionStorage/g)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(source).not.toMatch(/useState\(\s*\(\)\s*=>\s*sessionStorage/)
    expect(source).not.toMatch(/[^.]\bsessionStorage\.(getItem|setItem)/)
  })

  it('carries no native tooltip on the dismiss control (WCAG 1.4.13)', () => {
    expect(source).not.toMatch(/<[A-Za-z][^>]*\stitle=/)
    expect(source).toContain('aria-label="Dismiss this notice for this session"')
  })

  it('gives the dismiss control a touch target below lg', () => {
    expect(source).toMatch(/size-8 max-lg:size-10/)
  })
})
