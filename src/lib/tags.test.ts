import { describe, expect, it } from 'vitest'
import { dedupeTags } from './tags'

/**
 * `GET /word/pasian` returned `pos: ['Noun', 'NOUN']` — two chips for one part
 * of speech. That payload is captured verbatim in `lib/schemas.test.ts`, so the
 * dedupe rule below is pinned against real server output, not a hypothetical.
 */
describe('dedupeTags', () => {
  it('collapses the live Noun/NOUN pair, keeping the first spelling', () => {
    expect(dedupeTags(['Noun', 'NOUN'])).toEqual(['Noun'])
    expect(dedupeTags(['NOUN', 'Noun'])).toEqual(['NOUN'])
  })

  it('keeps genuinely distinct tags and their order', () => {
    expect(dedupeTags(['Verb', 'Noun', 'Verb'])).toEqual(['Verb', 'Noun'])
    expect(dedupeTags(['noun', 'noun phrase'])).toEqual(['noun', 'noun phrase'])
  })

  it('trims for comparison and for display, so a chip is never padded', () => {
    expect(dedupeTags(['  Noun  ', 'NOUN'])).toEqual(['Noun'])
  })

  it('drops blanks rather than rendering an empty chip', () => {
    expect(dedupeTags(['', '   ', 'Noun'])).toEqual(['Noun'])
    expect(dedupeTags([])).toEqual([])
  })

  it('never invents a tag the input did not contain', () => {
    const out = dedupeTags(['Noun', 'NOUN', 'Adj'])
    for (const tag of out) {
      expect(['Noun', 'NOUN', 'Adj'].some((input) => input.trim() === tag)).toBe(true)
    }
  })
})
