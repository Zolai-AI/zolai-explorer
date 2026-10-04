/**
 * Light/dark theme resolution for Zolai Explorer.
 *
 * Class-based, shadcn-style: `.dark` on `<html>` flips the token block in
 * `src/index.css`. Three preferences are supported — `system`, `light`, `dark` —
 * persisted under `zolai.theme` in `localStorage`.
 *
 * **No flash of the wrong theme.** `index.html` runs a tiny blocking script
 * *before* the bundle that applies the same resolution rules; see
 * `applyThemeDocument` below for the in-app half. The two must stay in sync —
 * `theme.test.ts` guards the script's shape.
 *
 * Everything in this module except the DOM helpers is pure, so the resolution
 * rules are unit tested in a plain Node environment (vitest runs with
 * `environment: 'node'`, no jsdom).
 */

export type Theme = 'system' | 'light' | 'dark'
/** What `system` collapses to once the OS preference is known. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'zolai.theme'
export const DEFAULT_THEME: Theme = 'system'
/** Cycle order used by the TopBar toggle and the inline pre-paint script. */
export const THEME_OPTIONS: readonly Theme[] = ['system', 'light', 'dark'] as const

/** Minimal Storage surface, so the round-trip is testable without jsdom. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark'
}

/**
 * Read a preference out of untrusted input (localStorage, a query string).
 * Anything unrecognised — including `null`, `''` and whitespace — yields
 * `DEFAULT_THEME`, never a throw.
 */
export function parseTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME
}

/** Collapse `system` against the OS preference. */
export function resolveTheme(preference: Theme, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/** The class shadcn expects on `<html>`; `light` is the absence of `.dark`. */
export function themeClassName(resolved: ResolvedTheme): string {
  return resolved === 'dark' ? 'dark' : ''
}

/** Next preference in the `system → light → dark` cycle. */
export function nextTheme(current: Theme): Theme {
  const index = THEME_OPTIONS.indexOf(current)
  return THEME_OPTIONS[(index + 1) % THEME_OPTIONS.length] ?? DEFAULT_THEME
}

export function readStoredTheme(storage: StorageLike | null | undefined): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY))
  } catch {
    // Storage can throw in hardened/partitioned contexts; fall back to system.
    return DEFAULT_THEME
  }
}

export function writeStoredTheme(storage: StorageLike | null | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A full or blocked store only costs persistence, never correctness.
  }
}

/** Does the OS currently ask for a dark UI? `false` when `matchMedia` is absent. */
export function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  } catch {
    return false
  }
}

/**
 * Apply `resolved` to the document: the `.dark` class, the `color-scheme`
 * style (drives native form controls and scrollbars) and the
 * `<meta name="color-scheme">` tag. Returns the resolved theme for convenience.
 */
export function applyThemeDocument(
  doc: Document | null | undefined,
  resolved: ResolvedTheme,
): ResolvedTheme {
  const root = doc?.documentElement
  if (!root) return resolved
  const className = themeClassName(resolved)
  if (className) root.classList.add(className)
  else root.classList.remove('dark')
  root.style.colorScheme = resolved
  doc
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', resolved === 'dark' ? 'dark light' : 'light dark')
  return resolved
}

/**
 * The whole in-app pipeline: preference + OS preference → applied document.
 * Used by the mount effect and by the TopBar toggle.
 */
export function syncThemeDocument(
  preference: Theme,
  prefersDark: boolean = systemPrefersDark(),
  doc: Document | null | undefined = globalThis.document,
): ResolvedTheme {
  return applyThemeDocument(doc, resolveTheme(preference, prefersDark))
}
