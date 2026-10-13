/**
 * Regression guards for the public contribution form.
 *
 * The defect this covers: the form rendered its own invented inputs
 * (`zolai`, `english`, `myanmar`, `pos`, …) and then POSTed only the eight
 * columns the server accepts. Nothing the visitor typed was transmitted, and
 * the two columns the server marks required — `word` and `suggested_value` —
 * had no input bound to them at all, so every submission failed before a
 * request was made. These tests pin the mapping to the server contract
 * (`zolai-core/zolai/api/contributions_router.py`: `word` and
 * `suggested_value` are `min_length=1` required for *every* type).
 */
import { describe, expect, it } from 'vitest'
import { validateContribution } from './Contribute'

const valid = {
  word: 'pasian',
  field: 'english',
  current_value: '',
  suggested_value: 'God, Creator',
  context: '',
  source: '',
  email: '',
}

describe('validateContribution — mirrors the server contract', () => {
  it('accepts a complete submission', () => {
    expect(validateContribution(valid, 'improve_meaning')).toEqual({})
  })

  it('requires `word` on EVERY type, including `other`', () => {
    // The server declares `word: str = Field(..., min_length=1)` with no
    // type-conditional exemption, so skipping it would only earn a 422.
    for (const type of ['new_word', 'improve_meaning', 'add_usage', 'fix_typo', 'add_grammar', 'other'] as const) {
      const errors = validateContribution({ ...valid, word: '' }, type)
      expect(errors.word, `type ${type}`).toBeTruthy()
    }
  })

  it('treats whitespace-only `word` as missing', () => {
    expect(validateContribution({ ...valid, word: '   ' }, 'new_word').word).toBeTruthy()
  })

  it('requires `suggested_value` on EVERY type', () => {
    for (const type of ['new_word', 'improve_meaning', 'add_usage', 'fix_typo', 'add_grammar', 'other'] as const) {
      const errors = validateContribution({ ...valid, suggested_value: '' }, type)
      expect(errors.suggested_value, `type ${type}`).toBeTruthy()
    }
  })

  it('does not require `current_value` — only a correction states one', () => {
    expect(validateContribution({ ...valid, current_value: '' }, 'fix_typo').current_value).toBeUndefined()
  })

  it('accepts an absent email but rejects a malformed one', () => {
    expect(validateContribution({ ...valid, email: '' }, 'new_word').email).toBeUndefined()
    expect(validateContribution({ ...valid, email: 'nope' }, 'new_word').email).toBeTruthy()
    expect(validateContribution({ ...valid, email: 'peter@example.com' }, 'new_word').email).toBeUndefined()
  })

  it('never invents a field name in the error text', () => {
    // The old form used a bare field name; the message must name the input.
    const errors = validateContribution({ ...valid, word: '' }, 'new_word')
    expect(errors.word).toContain('word to add')
  })
})
