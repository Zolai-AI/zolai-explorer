/**
 * Desktop-sidebar collapse preference.
 *
 * Same shape as `theme.ts`: the DOM effect lives in the component, the
 * read/parse/write logic is pure and unit tested in a plain Node environment.
 * `localStorage` is the only persistence — there is no server-side user state.
 */

export const SIDEBAR_STORAGE_KEY = 'zolai.sidebarCollapsed'
export const DEFAULT_SIDEBAR_COLLAPSED = false

/** Minimal Storage surface so the round-trip is testable without jsdom. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Only the literal `"true"` collapses the rail; anything else widens it. */
export function parseCollapsed(value: unknown): boolean {
  return value === 'true'
}

export function readSidebarCollapsed(
  storage: StorageLike | null | undefined,
): boolean {
  try {
    return parseCollapsed(storage?.getItem(SIDEBAR_STORAGE_KEY))
  } catch {
    // Blocked or partitioned storage only costs persistence, never correctness.
    return DEFAULT_SIDEBAR_COLLAPSED
  }
}

export function writeSidebarCollapsed(
  storage: StorageLike | null | undefined,
  collapsed: boolean,
): void {
  try {
    storage?.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'true' : 'false')
  } catch {
    // Ignored on purpose — see above.
  }
}

/** `lg` is the breakpoint where the persistent rail replaces the `<Sheet>`. */
export const SIDEBAR_BREAKPOINT_PX = 1024
