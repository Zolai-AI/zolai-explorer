/**
 * Node-env specs for the health-poll pause store — same seam as `key.test.ts`:
 * the storage backend is injected, so the round-trip needs no DOM.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HEALTH_POLL_PAUSED_STORAGE_KEY,
  isHealthPollPaused,
  setHealthPollPaused,
  subscribeHealthPoll,
  __setStorageForTests,
} from './healthPoll'
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

describe('health poll pause — round-trip', () => {
  it('polls by default, with nothing written to storage', () => {
    expect(isHealthPollPaused()).toBe(false)
    expect(storage.dump()).toEqual({})
  })

  it('persists a pause under the documented storage key', () => {
    expect(HEALTH_POLL_PAUSED_STORAGE_KEY).toBe('zolai.healthPollPaused')
    setHealthPollPaused(true)
    expect(isHealthPollPaused()).toBe(true)
    expect(storage.dump()).toEqual({ 'zolai.healthPollPaused': 'true' })
  })

  it('resuming removes the key rather than writing a "false" value', () => {
    setHealthPollPaused(true)
    setHealthPollPaused(false)
    expect(isHealthPollPaused()).toBe(false)
    expect(storage.getItem(HEALTH_POLL_PAUSED_STORAGE_KEY)).toBeNull()
  })

  it('reads only its own value as a pause', () => {
    // A slot someone else wrote is not this operator's choice.
    storage.setItem(HEALTH_POLL_PAUSED_STORAGE_KEY, 'yes')
    expect(isHealthPollPaused()).toBe(false)
  })
})

describe('health poll pause — a blocked store costs persistence, not correctness', () => {
  function throwingStorage(): StorageLike {
    return {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
  }

  it('falls back to polling when a read throws', () => {
    __setStorageForTests(throwingStorage())
    expect(() => isHealthPollPaused()).not.toThrow()
    expect(isHealthPollPaused()).toBe(false)
  })

  it('still records the pause in memory when the write throws', () => {
    __setStorageForTests(throwingStorage())
    expect(() => setHealthPollPaused(true)).not.toThrow()
    // The read throws too, so this session runs on the mirror: a button that
    // says "paused" must stop the poll even when storage is blocked.
    expect(isHealthPollPaused()).toBe(true)
    setHealthPollPaused(false)
    expect(isHealthPollPaused()).toBe(false)
  })
})

describe('health poll pause — subscriptions', () => {
  it('notifies on both edges, and stops after unsubscribe', () => {
    let calls = 0
    const unsubscribe = subscribeHealthPoll(() => {
      calls += 1
    })

    setHealthPollPaused(true)
    expect(calls).toBe(1)

    setHealthPollPaused(false)
    expect(calls).toBe(2)

    unsubscribe()
    setHealthPollPaused(true)
    expect(calls).toBe(2)
  })
})
