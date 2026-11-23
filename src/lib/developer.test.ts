/**
 * Developer mode: the preference round-trip and the two-audience caption rule.
 *
 * The point of issue #9 is that the *default* is plain language, so the tests
 * that matter are the ones proving a path cannot leak when the preference is
 * off — and proving that turning it on puts the same path back, verbatim,
 * because the toggle is a display preference and not a different app.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEVELOPER_STORAGE_KEY,
  __setStorageForTests,
  cardSubtitle,
  parseDeveloper,
  readDeveloper,
  subscribeDeveloper,
  writeDeveloper,
  type StorageLike,
} from './developer'

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

describe('the preference', () => {
  it('is off when nothing was ever written', () => {
    expect(readDeveloper()).toBe(false)
  })

  it('treats anything but an explicit on as off', () => {
    for (const value of ['', ' ', '0', 'no', 'false', 'undefined', 'null']) {
      storage.setItem(DEVELOPER_STORAGE_KEY, value)
      expect(readDeveloper(), `'${value}' must not enable it`).toBe(false)
    }
    expect(parseDeveloper('1')).toBe(true)
    expect(parseDeveloper('true')).toBe(true)
  })

  it('round-trips, and stores no key material in its own record', () => {
    writeDeveloper(true)
    expect(readDeveloper()).toBe(true)
    expect(storage.dump()).toEqual({ [DEVELOPER_STORAGE_KEY]: '1' })

    writeDeveloper(false)
    expect(readDeveloper()).toBe(false)
    // Off removes the entry rather than persisting a "false" string, so a fresh
    // profile and a deliberately-off one look the same in storage.
    expect(storage.dump()).toEqual({})
  })

  it('notifies subscribers, and unsubscribing stops only that one', () => {
    const seen: string[] = []
    const offA = subscribeDeveloper(() => seen.push('a'))
    subscribeDeveloper(() => seen.push('b'))

    writeDeveloper(true)
    expect(seen).toEqual(['a', 'b'])

    offA()
    writeDeveloper(false)
    expect(seen).toEqual(['a', 'b', 'b'])
  })
})

describe('cardSubtitle', () => {
  const PATH = 'GET /knowledge/version'
  const PLAIN = 'what the deployed corpus is'

  it('shows the wire path beside the plain words when developer mode is on', () => {
    expect(cardSubtitle(true, PATH, PLAIN)).toBe(`${PATH} · ${PLAIN}`)
    expect(cardSubtitle(true, PATH)).toBe(PATH)
  })

  it('drops the path and keeps the sentence when it is off', () => {
    expect(cardSubtitle(false, PATH, PLAIN)).toBe(PLAIN)
  })

  it('renders no caption for a path-only subtitle rather than inventing one', () => {
    // A card whose whole caption was a path loses the caption. It must not be
    // handed a stand-in the server never promised — `undefined` means the Card
    // component draws its title alone.
    expect(cardSubtitle(false, PATH)).toBeUndefined()
    expect(cardSubtitle(false, PATH, '')).toBeUndefined()
  })
})
