import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_THEME,
  nextTheme,
  readStoredTheme,
  resolveTheme,
  syncThemeDocument,
  systemPrefersDark,
  writeStoredTheme,
  type ResolvedTheme,
  type Theme,
} from './theme'

/**
 * Reactive access to the theme preference.
 *
 * The preference is held in React state seeded from `localStorage`; the OS
 * preference is tracked with `matchMedia` so a `system` choice follows the
 * device live. The `.dark` class is applied by the blocking script in
 * `index.html` before first paint — this hook only re-applies it when the
 * preference changes, and re-syncs it on mount in case the two ever drift.
 */
export function useThemePreference(): {
  theme: Theme
  resolved: ResolvedTheme
  setTheme: (next: Theme) => void
  cycle: () => void
} {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [prefersDark, setPrefersDark] = useState<boolean>(false)

  useEffect(() => {
    setThemeState(readStoredTheme(globalThis.localStorage))
    setPrefersDark(systemPrefersDark())

    // Follow the OS while the preference is `system`.
    let query: MediaQueryList | undefined
    try {
      query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    } catch {
      query = undefined
    }
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query?.addEventListener?.('change', onChange)
    return () => query?.removeEventListener?.('change', onChange)
  }, [])

  const resolved = resolveTheme(theme, prefersDark)

  useEffect(() => {
    syncThemeDocument(theme, prefersDark)
  }, [theme, prefersDark])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeStoredTheme(globalThis.localStorage, next)
  }, [])

  const cycle = useCallback(() => {
    setThemeState((current) => {
      const next = nextTheme(current)
      writeStoredTheme(globalThis.localStorage, next)
      return next
    })
  }, [])

  return { theme, resolved, setTheme, cycle }
}

/** Just the resolved theme — used by the toast layer to pick light or dark. */
export function useResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(
      readStoredTheme(globalThis.localStorage),
      systemPrefersDark(),
    ),
  )

  useEffect(() => {
    const theme = readStoredTheme(globalThis.localStorage)
    setResolved(syncThemeDocument(theme, systemPrefersDark()))
  }, [])

  return resolved
}
