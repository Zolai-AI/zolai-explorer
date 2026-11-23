/**
 * Health-poll pause flag.
 *
 * The 30s `/health` poll runs unconditionally, so an operator who is pointed at
 * a wedged API keeps paying a request loop they cannot stop. This is the one
 * piece of state that control needs: a boolean, persisted under
 * `zolai.healthPollPaused` so a pause survives a reload.
 *
 * **Only the pause is stored.** `false` removes the key instead of writing
 * `'false'`, because an absent key is the default (polling) — that keeps a
 * resumed profile clean and means a hand-edited value nobody wrote is not
 * mistaken for a real preference.
 *
 * The storage backend is injectable so the round-trip can be unit tested in a
 * plain Node environment (no jsdom dependency) — the same seam as `key.ts`.
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { StorageLike } from './key'

export const HEALTH_POLL_PAUSED_STORAGE_KEY = 'zolai.healthPollPaused'
/** The value written when paused — anything else in the slot is not a pause. */
const PAUSED = 'true'

const listeners = new Set<() => void>()

function memoryFallback(): StorageLike {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

let injected: StorageLike | null = null
let fallback: StorageLike | null = null
// The pause the operator chose this session, held even when the store refuses
// it. Without this a blocked write would silently un-pause the poll on the next
// read, which is the opposite of what a "pause" button promises.
let session = false

function storage(): StorageLike {
  if (injected) return injected
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage
  } catch {
    // Access to localStorage can throw in hardened/partitioned contexts.
  }
  fallback ??= memoryFallback()
  return fallback
}

export function isHealthPollPaused(): boolean {
  try {
    return storage().getItem(HEALTH_POLL_PAUSED_STORAGE_KEY) === PAUSED
  } catch {
    return session
  }
}

export function setHealthPollPaused(paused: boolean): void {
  session = paused
  try {
    if (paused) storage().setItem(HEALTH_POLL_PAUSED_STORAGE_KEY, PAUSED)
    else storage().removeItem(HEALTH_POLL_PAUSED_STORAGE_KEY)
  } catch {
    // Storage may be full or blocked; `session` still drives this tab.
  }
  notify()
}

function notify(): void {
  for (const fn of listeners) fn()
}

/** Subscribe to pause changes (used by the pill and the ⋯ menu to re-render). */
export function subscribeHealthPoll(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/**
 * Reactive read/write of the pause flag.
 *
 * The app is client-only (`createRoot` in `main.tsx`, no hydration), so the
 * server snapshot reads the same store: a static render must show the pause the
 * operator actually chose rather than a fabricated default.
 */
export function useHealthPollPaused(): [boolean, (paused: boolean) => void] {
  const paused = useSyncExternalStore(subscribeHealthPoll, isHealthPollPaused, isHealthPollPaused)
  const setPaused = useCallback(setHealthPollPaused, [])
  return [paused, setPaused]
}

/** Test seam: inject a fake storage backend, or pass `null` to restore. */
export function __setStorageForTests(store: StorageLike | null): void {
  injected = store
  // Swapping the backend also resets the session mirror, so a spec cannot
  // inherit a pause it never asked for.
  session = false
}
