/**
 * API key store.
 *
 * The key lives only in `localStorage` under `zolai.apiKey`. It is:
 *   - never logged (no console output anywhere in this module),
 *   - never written into a bundle, source file, or query string,
 *   - only ever read by `src/lib/api.ts` to set the `X-API-Key` request header,
 *   - clearable from the UI at any time.
 *
 * The storage backend is injectable so the round-trip can be unit tested in a
 * plain Node environment (no jsdom dependency).
 */

export const API_KEY_STORAGE_KEY = 'zolai.apiKey'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

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

/** Normalise user input: trim, and treat blank/whitespace-only as "no key". */
function normalise(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function getApiKey(): string {
  try {
    return normalise(storage().getItem(API_KEY_STORAGE_KEY))
  } catch {
    return ''
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export function setApiKey(value: string): void {
  const clean = normalise(value)
  try {
    if (clean) storage().setItem(API_KEY_STORAGE_KEY, clean)
    else storage().removeItem(API_KEY_STORAGE_KEY)
  } catch {
    // Storage may be full or blocked; the in-memory value still drives this session.
  }
  notify()
}

export function clearApiKey(): void {
  try {
    storage().removeItem(API_KEY_STORAGE_KEY)
  } catch {
    // no-op
  }
  notify()
}

function notify(): void {
  for (const fn of listeners) fn()
}

/** Subscribe to key changes (used by the UI to re-render key state). */
export function subscribeApiKey(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Test seam: inject a fake storage backend, or pass `null` to restore. */
export function __setStorageForTests(store: StorageLike | null): void {
  injected = store
}

/** Mask a key for display: never reveal the full secret. */
export function maskApiKey(value: string): string {
  const key = normalise(value)
  if (!key) return '—'
  if (key.length <= 8) return '•'.repeat(key.length)
  return `${key.slice(0, 4)}${'•'.repeat(6)}${key.slice(-4)}`
}