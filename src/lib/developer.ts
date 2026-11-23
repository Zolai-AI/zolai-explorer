/**
 * Developer mode — the switch between the app's two audiences (issue #9).
 *
 * Studio is used by people who work on the API and by people who only want to
 * know what the knowledge base says. The bundle was written for the first
 * group: nearly every panel caption is a wire path (`GET /knowledge/version`),
 * the key dialog lists scope names (`apikey:manage`), and the login page
 * explains session tokens. For the second group that is noise, and none of it
 * is *needed* to read the page.
 *
 * So the technical vocabulary is one preference, **default off**, persisted
 * under `zolai.developer`. Off is not "hidden truth": `cardSubtitle` swaps the
 * path for the plain sentence the page already had to say, and a caption that
 * was *nothing but* a path disappears rather than being replaced by an invented
 * label. The data on screen does not change — only the caption does.
 *
 * Pure module (React-free) so the round-trip and the caption arithmetic are
 * unit tested in the plain Node environment, like `theme.ts` and `key.ts`.
 */

export const DEVELOPER_STORAGE_KEY = 'zolai.developer'

/** Minimal Storage surface, so the round-trip is testable without jsdom. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const listeners = new Set<() => void>()

let injected: StorageLike | null = null
let fallback: StorageLike | null = null

function memoryFallback(): StorageLike {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

function storage(): StorageLike {
  if (injected) return injected
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage
  } catch {
    // Access can throw in hardened/partitioned contexts.
  }
  fallback ??= memoryFallback()
  return fallback
}

/**
 * Only an explicit "on" is on. A corrupt value, an empty string, `"0"` and
 * absent all mean the plain-language default.
 */
export function parseDeveloper(value: unknown): boolean {
  return value === '1' || value === 'true'
}

export function readDeveloper(): boolean {
  try {
    return parseDeveloper(storage().getItem(DEVELOPER_STORAGE_KEY))
  } catch {
    return false
  }
}

export function writeDeveloper(on: boolean): void {
  try {
    if (on) storage().setItem(DEVELOPER_STORAGE_KEY, '1')
    else storage().removeItem(DEVELOPER_STORAGE_KEY)
  } catch {
    // A blocked store costs persistence across reloads, not this session.
  }
  for (const fn of listeners) fn()
}

/** Subscribe to preference changes so every mounted panel re-labels at once. */
export function subscribeDeveloper(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Test seam: inject a fake storage backend, or pass `null` to restore. */
export function __setStorageForTests(store: StorageLike | null): void {
  injected = store
}

/**
 * One Card caption, two audiences.
 *
 * `technical` is the wire path the page used to print unconditionally; `plain`
 * is what the caption means to someone who is not reading the request. With
 * developer mode off the path goes and the sentence stays — and a caption that
 * carried no sentence returns `undefined`, so the card shows no subtitle rather
 * than a placeholder the server never promised.
 */
export function cardSubtitle(
  developer: boolean,
  technical: string,
  plain?: string,
): string | undefined {
  if (developer) return plain ? `${technical} · ${plain}` : technical
  return plain || undefined
}
