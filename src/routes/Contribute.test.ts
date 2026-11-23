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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api'
import { submissionFailureNotice, validateContribution } from './Contribute'

/** Comment-stripped source: prose must neither fail nor satisfy a code guard. */
const CODE = readFileSync(fileURLToPath(new URL('./Contribute.tsx', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')


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

/**
 * Candidate #10 — the submit failure.
 *
 * It used to build the copy from `error.message` verbatim (an `ApiError` *or*
 * any `Error`) and announce that same raw sentence twice: inline via `setResult`
 * and again as a toast. A raw exception string is a screenshot-able leak surface,
 * and one failure must not make two identical announcements. The durable inline
 * record now runs the failure through the app's classifier, and the toast is only
 * the transient pointer at it.
 */
describe('submissionFailureNotice — classified, never the raw exception', () => {
  it('classifies a server 422 with its own detail, and frames it durably', () => {
    const notice = submissionFailureNotice(
      new ApiError('body.word: value is required', 422, '/api/v1/contributions', 'http'),
    )
    // The server's own (capped, sanitized) message is legitimate here.
    expect(notice).toContain('body.word: value is required')
    // The durable record says nothing was saved — the role the toast does not carry.
    expect(notice).toContain('not recorded')
  })

  it('never echoes a raw exception message', () => {
    const notice = submissionFailureNotice(new Error('connect ECONNREFUSED 10.0.0.7:5432 db'))
    expect(notice).not.toContain('ECONNREFUSED')
    expect(notice).not.toContain('10.0.0.7')
    expect(notice).toContain('not recorded')
  })

  it('keeps the timeout branch recognizable through the classifier', () => {
    const notice = submissionFailureNotice(
      new ApiError('Request timed out after 15000ms', 0, '/api/v1/contributions', 'timeout'),
    )
    expect(notice).toMatch(/timed out/i)
    expect(notice).toContain('not recorded')
  })
})

describe('Contribute layout — uses the full desktop column', () => {
  it('does not re-cap the page the shell already spans', () => {
    // #25 removed the shell's `max-w-6xl`; a route-level `max-w-3xl` put the
    // narrow column back, centred in the unused width.
    expect(CODE).not.toContain('max-w-3xl')
    expect(CODE).toContain('xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')
  })
})

describe('Contribute submit catch — no raw echo, no double announcement', () => {
  it('does not build the copy from a raw exception message', () => {
    // The thing actually forbidden: `error.message` as user-facing copy.
    expect(CODE).not.toMatch(/\berror\.message\b/)
  })

  it('routes the failure through the shared classifier', () => {
    expect(CODE).toContain('failureDetail(error)')
    expect(CODE).toContain('submissionFailureNotice(error)')
  })

  it('no longer speaks the same sentence in the inline result and the toast', () => {
    // The defect was one `message` variable feeding both announcements.
    expect(CODE).not.toContain('setResult({ success: false, message })')
    expect(CODE).not.toContain('{ description: message }')
  })
})
