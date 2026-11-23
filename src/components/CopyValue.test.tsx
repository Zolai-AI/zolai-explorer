/**
 * What the clipboard confirmation *says*.
 *
 * Both message builders take a **label and nothing else** — there is no
 * parameter through which the copied value could reach the toast, and these
 * specs pin that contract: the confirmation (and the failure copy) name the
 * copied thing by label only and can never contain the secret itself.
 *
 * Node env, pure string logic — no DOM, no rendering.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CopyValue, copyConfirmationMessage, copyFailureMessage } from './CopyValue'

/** Shaped like a minted key, unmistakably synthetic. It must never appear in any copy. */
const SECRET = 'zolai_sk_aaaabbbbccccddddeeeeffff00001111'

const everyMessage = (label?: string): string[] => [
  copyConfirmationMessage(label),
  copyFailureMessage(label),
]

describe('clipboard confirmation copy', () => {
  it('never contains the copied value, with a label or without one', () => {
    for (const message of [...everyMessage('the new API key'), ...everyMessage()]) {
      expect(message).not.toContain(SECRET)
      expect(message).not.toContain('zolai_sk')
    }
  })

  it('confirms by label alone', () => {
    expect(copyConfirmationMessage('the raw JSON')).toBe('Copied the raw JSON')
    expect(copyConfirmationMessage('the new API key')).toBe('Copied the new API key')
  })

  it('falls back to a bare "Copied" when no label is given', () => {
    expect(copyConfirmationMessage()).toBe('Copied')
  })

  it('keeps the failure copy user-facing and value-free', () => {
    expect(copyFailureMessage('the new API key')).toContain('Could not copy the new API key')
    // Without a label the fallback noun is generic, never the value.
    expect(copyFailureMessage()).toContain('Could not copy the text')
  })
})

/**
 * The rendered attributes are the part a future edit can break silently: a
 * `title={value}` or `aria-label={value}` would put key material into the DOM,
 * where it is visible to a screenshot, an extension, or the accessibility tree.
 * The builders alone cannot catch that, so the markup is asserted directly.
 * `react-dom/server` is how this repo renders without a DOM.
 */
describe('the rendered control', () => {
  const html = renderToStaticMarkup(<CopyValue value={SECRET} label="the new API key" />)

  it('never paints the value into any attribute or text node', () => {
    expect(html).not.toContain(SECRET)
    expect(html).not.toContain('zolai_sk')
  })

  it('names itself by the label alone', () => {
    expect(html).toContain('aria-label="Copy the new API key"')
  })
})
