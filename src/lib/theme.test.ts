import { afterEach, describe, expect, it, vi } from 'vitest'
// Vite's `?raw` keeps this a browser-scope import: no `node:fs`, so the guard
// still typechecks under tsconfig.app.json (which has no node types).
import indexHtml from '../../index.html?raw'
import {
  DEFAULT_THEME,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  applyThemeDocument,
  isTheme,
  nextTheme,
  parseTheme,
  readStoredTheme,
  resolveTheme,
  syncThemeDocument,
  themeClassName,
  writeStoredTheme,
  type StorageLike,
  type Theme,
} from './theme'

function fakeStorage(seed: Record<string, string> = {}): StorageLike & {
  dump: () => Record<string, string>
} {
  const mem = new Map(Object.entries(seed))
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    dump: () => Object.fromEntries(mem),
  }
}

/** Minimal Document stand-in: only what `applyThemeDocument` touches. */
function fakeDocument() {
  const classes = new Set<string>()
  const meta: Record<string, string> = {}
  return {
    documentElement: {
      classList: {
        add: (c: string) => void classes.add(c),
        remove: (c: string) => void classes.delete(c),
        contains: (c: string) => classes.has(c),
      },
      style: {} as { colorScheme?: string },
    },
    querySelector: (selector: string) =>
      selector === 'meta[name="color-scheme"]'
        ? { setAttribute: (_k: string, v: string) => void (meta.content = v) }
        : null,
    classes,
    meta,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('theme preference parsing', () => {
  it('accepts only the three documented preferences', () => {
    expect(isTheme('system')).toBe(true)
    expect(isTheme('light')).toBe(true)
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('sepia')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(1)).toBe(false)
  })

  it('falls back to system for absent or corrupted stored values', () => {
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme(null)).toBe(DEFAULT_THEME)
    expect(parseTheme('')).toBe(DEFAULT_THEME)
    expect(parseTheme('Dark')).toBe(DEFAULT_THEME)
    expect(parseTheme({})).toBe(DEFAULT_THEME)
  })
})

describe('resolveTheme', () => {
  it('passes explicit preferences straight through', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('collapses system against prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('themeClassName', () => {
  it('adds .dark only for dark (shadcn class strategy)', () => {
    expect(themeClassName('dark')).toBe('dark')
    expect(themeClassName('light')).toBe('')
  })
})

describe('nextTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  it('visits every declared option exactly once per cycle', () => {
    const seen: Theme[] = []
    let current: Theme = 'system'
    for (let i = 0; i < THEME_OPTIONS.length; i += 1) {
      seen.push(current)
      current = nextTheme(current)
    }
    expect([...seen].sort()).toEqual([...THEME_OPTIONS].sort())
  })
})

describe('persistence', () => {
  it('round-trips through localStorage under zolai.theme', () => {
    const storage = fakeStorage()
    writeStoredTheme(storage, 'dark')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readStoredTheme(storage)).toBe('dark')
  })

  it('reads system when nothing is stored yet (first visit)', () => {
    expect(readStoredTheme(fakeStorage())).toBe('system')
  })

  it('recovers from a corrupted stored value', () => {
    expect(readStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('system')
  })

  it('survives a storage that throws (private mode / partitioned)', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(readStoredTheme(hostile)).toBe('system')
    expect(() => writeStoredTheme(hostile, 'dark')).not.toThrow()
  })

  it('tolerates a missing storage backend (SSR / tests)', () => {
    expect(readStoredTheme(null)).toBe('system')
    expect(() => writeStoredTheme(undefined, 'light')).not.toThrow()
  })
})

describe('applyThemeDocument', () => {
  it('adds .dark, sets colorScheme and the meta tag for dark', () => {
    const doc = fakeDocument()
    expect(applyThemeDocument(doc as unknown as Document, 'dark')).toBe('dark')
    expect(doc.classes.has('dark')).toBe(true)
    expect(doc.documentElement.style.colorScheme).toBe('dark')
    expect(doc.meta.content).toBe('dark light')
  })

  it('removes .dark and declares light first for light', () => {
    const doc = fakeDocument()
    applyThemeDocument(doc as unknown as Document, 'dark')
    applyThemeDocument(doc as unknown as Document, 'light')
    expect(doc.classes.has('dark')).toBe(false)
    expect(doc.documentElement.style.colorScheme).toBe('light')
    expect(doc.meta.content).toBe('light dark')
  })

  it('is a no-op without a document', () => {
    expect(applyThemeDocument(null, 'dark')).toBe('dark')
    expect(applyThemeDocument(undefined, 'light')).toBe('light')
  })
})

describe('syncThemeDocument', () => {
  it('resolves system against the injected prefers-color-scheme', () => {
    const doc = fakeDocument()
    expect(syncThemeDocument('system', true, doc as unknown as Document)).toBe('dark')
    expect(doc.classes.has('dark')).toBe(true)

    const light = fakeDocument()
    expect(syncThemeDocument('system', false, light as unknown as Document)).toBe('light')
    expect(light.classes.has('dark')).toBe(false)
  })

  it('ignores the OS preference when the user pinned light or dark', () => {
    const doc = fakeDocument()
    syncThemeDocument('light', true, doc as unknown as Document)
    expect(doc.classes.has('dark')).toBe(false)

    const dark = fakeDocument()
    syncThemeDocument('dark', false, dark as unknown as Document)
    expect(dark.classes.has('dark')).toBe(true)
  })
})

describe('index.html pre-paint script (no flash of wrong theme)', () => {
  const html = indexHtml
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

  it('ships an inline blocking script before the module entrypoint', () => {
    expect(script.length).toBeGreaterThan(0)
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.tsx"'))
  })

  it('applies the same resolution rules as src/lib/theme.ts', () => {
    expect(script).toContain(THEME_STORAGE_KEY)
    for (const option of THEME_OPTIONS) expect(script).toContain(`'${option}'`)
    expect(script).toContain('prefers-color-scheme: dark')
    expect(script).toContain("classList.toggle('dark'")
    expect(script).toContain('meta[name="color-scheme"]')
  })

  it('does not hardcode a theme on <html> (the script decides)', () => {
    expect(html).not.toMatch(/<html[^>]*class="dark"/)
    expect(html).toContain('<meta name="color-scheme"')
  })
})
