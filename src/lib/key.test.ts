import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  API_KEY_STORAGE_KEY,
  clearApiKey,
  getApiKey,
  hasApiKey,
  maskApiKey,
  setApiKey,
  subscribeApiKey,
  __setStorageForTests,
} from './key'
import type { StorageLike } from './key'

function fakeStorage(): StorageLike & { dump: () => Record<string, string> } {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    dump: () => Object.fromEntries(mem),
  }
}

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  __setStorageForTests(storage)
})

afterEach(() => {
  __setStorageForTests(null)
})

describe('key store round-trip', () => {
  it('writes then reads the same value back', () => {
    setApiKey('zl_live_abc123')
    expect(getApiKey()).toBe('zl_live_abc123')
    expect(hasApiKey()).toBe(true)
    expect(storage.getItem(API_KEY_STORAGE_KEY)).toBe('zl_live_abc123')
  })

  it('persists under the documented storage key', () => {
    expect(API_KEY_STORAGE_KEY).toBe('zolai.apiKey')
    setApiKey('zl_persisted')
    expect(storage.dump()).toEqual({ 'zolai.apiKey': 'zl_persisted' })
  })

  it('clears the stored key and reports no key', () => {
    setApiKey('zl_live_abc123')
    clearApiKey()
    expect(getApiKey()).toBe('')
    expect(hasApiKey()).toBe(false)
    expect(storage.getItem(API_KEY_STORAGE_KEY)).toBeNull()
  })

  it('trims surrounding whitespace and treats blank input as no key', () => {
    setApiKey('  zl_padded  ')
    expect(getApiKey()).toBe('zl_padded')

    setApiKey('   ')
    expect(getApiKey()).toBe('')
    expect(hasApiKey()).toBe(false)
    expect(storage.getItem(API_KEY_STORAGE_KEY)).toBeNull()
  })

  it('returns an empty string when the key was never set', () => {
    expect(getApiKey()).toBe('')
    expect(hasApiKey()).toBe(false)
  })

  it('tolerates a null value coming back from storage', () => {
    storage.setItem(API_KEY_STORAGE_KEY, '')
    expect(getApiKey()).toBe('')
  })
})

describe('key store subscriptions', () => {
  it('notifies subscribers on set and clear, and stops after unsubscribe', () => {
    let calls = 0
    const unsubscribe = subscribeApiKey(() => {
      calls += 1
    })

    setApiKey('zl_one')
    expect(calls).toBe(1)

    clearApiKey()
    expect(calls).toBe(2)

    unsubscribe()
    setApiKey('zl_two')
    expect(calls).toBe(2)
  })
})

describe('key masking', () => {
  it('never reveals the middle of a key', () => {
    const masked = maskApiKey('zl_live_abc123456')
    expect(masked).toContain('zl_l')
    expect(masked).toContain('3456')
    expect(masked).not.toContain('abc123')
  })

  it('fully masks a short key', () => {
    expect(maskApiKey('short')).toBe('•••••')
  })

  it('renders a dash when there is no key', () => {
    expect(maskApiKey('')).toBe('—')
  })
})