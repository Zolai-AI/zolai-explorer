import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EVIDENCE_LIMIT,
  DEFAULT_WORD_LIMIT,
  EVIDENCE_LIMIT_CHOICES,
  SUB_RESOURCE_ENDPOINT,
  WORD_LIMIT_CHOICES,
  coerceWordLimit,
  defaultWordLimit,
  wordKey,
  wordLimitChoices,
} from './api'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => json({ word: 'pasian', contexts: [] }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('word limit choices', () => {
  it('offers the shared choices, with the evidence ceiling raised to 200', () => {
    expect(wordLimitChoices('contexts')).toBe(WORD_LIMIT_CHOICES)
    expect(wordLimitChoices('collocations')).toBe(WORD_LIMIT_CHOICES)
    expect(wordLimitChoices('patterns')).toBe(WORD_LIMIT_CHOICES)
    expect(wordLimitChoices('forms')).toBe(WORD_LIMIT_CHOICES)
    expect(wordLimitChoices('evidence')).toBe(EVIDENCE_LIMIT_CHOICES)
    expect(Math.max(...EVIDENCE_LIMIT_CHOICES)).toBe(200)
    expect(Math.max(...WORD_LIMIT_CHOICES)).toBe(100)
  })

  it('uses each route\\u2019s documented server default', () => {
    expect(defaultWordLimit('contexts')).toBe(DEFAULT_WORD_LIMIT)
    expect(defaultWordLimit('evidence')).toBe(DEFAULT_EVIDENCE_LIMIT)
  })

  it('maps every sub-resource tab to its registry endpoint', () => {
    expect(SUB_RESOURCE_ENDPOINT.contexts).toBe('word.contexts')
    expect(SUB_RESOURCE_ENDPOINT.collocations).toBe('word.collocations')
    expect(SUB_RESOURCE_ENDPOINT.patterns).toBe('word.patterns')
    expect(SUB_RESOURCE_ENDPOINT.evidence).toBe('word.evidence')
    expect(SUB_RESOURCE_ENDPOINT.forms).toBe('word.forms')
  })
})

describe('coerceWordLimit', () => {
  it('keeps a listed choice as given', () => {
    expect(coerceWordLimit(50, 'contexts')).toBe(50)
    expect(coerceWordLimit('100', 'contexts')).toBe(100)
    expect(coerceWordLimit(200, 'evidence')).toBe(200)
  })

  it('clamps an over-large value to the route cap instead of letting the API 422', () => {
    expect(coerceWordLimit(500, 'contexts')).toBe(100)
    expect(coerceWordLimit(500, 'evidence')).toBe(200)
  })

  it('never returns below 1, which the API rejects', () => {
    expect(coerceWordLimit(0, 'contexts')).toBe(DEFAULT_WORD_LIMIT)
    expect(coerceWordLimit(-10, 'contexts')).toBe(DEFAULT_WORD_LIMIT)
  })

  it('falls back to that route default for junk input', () => {
    expect(coerceWordLimit('abc', 'contexts')).toBe(DEFAULT_WORD_LIMIT)
    expect(coerceWordLimit(null, 'evidence')).toBe(DEFAULT_EVIDENCE_LIMIT)
    // 200 is the evidence cap but not the 100-capped routes' cap: it clamps.
    expect(coerceWordLimit(200, 'contexts')).toBe(100)
  })

  it('truncates a fractional value', () => {
    expect(coerceWordLimit(20.9, 'contexts')).toBe(20)
  })
})

describe('wordKey', () => {
  it('normalises the word for cache keys and requests', () => {
    expect(wordKey('  Pasian ')).toBe('pasian')
    expect(wordKey('')).toBe('')
  })
})

describe('limit travels in the query string', () => {
  it('is the documented parameter name \\u2014 never page_size', async () => {
    const { queryLimitPath } = await import('../../lib/endpoints')
    const path = queryLimitPath('word.contexts', { word: 'pasian' }, 20)
    expect(path).toBe('/word/pasian/contexts?limit=20')
    expect(path).not.toContain('page_size')
  })

  it('is declared as a query limit on every sub-resource route', async () => {
    const { ENDPOINTS_BY_ID } = await import('../../lib/endpoints')
    for (const id of Object.values(SUB_RESOURCE_ENDPOINT)) {
      expect(ENDPOINTS_BY_ID[id].limit, id).toBe('query')
    }
  })
})