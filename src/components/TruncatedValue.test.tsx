import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TruncatedValue, previewCell } from './TruncatedValue'

/**
 * The disclosure `Review.tsx` and `Orchestra.tsx` share. A value too long for its
 * cell used to hide behind a native `title` tooltip, which is neither
 * keyboard-reachable nor dismissible nor hover-persistent (WCAG 1.4.13). These
 * specs pin the replacement — an in-app disclosure whose preview never misrepresents
 * the value, and which does not regress back to a tooltip — and are the reason a
 * future `title={…}` cannot quietly reappear on a truncated cell.
 */

const LONG = JSON.stringify({
  morphology: { root: 'pasian', affixes: ['pa-', '-sian'], gloss: 'a reconstructed example payload' },
  source: 'zolai-wiki/grammar.md',
})

/** React escapes attribute-free text on render; the markup is what a user sees. */
const escape = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

describe('previewCell', () => {
  it('leaves a value that fits the cell untouched', () => {
    const text = 'a'.repeat(80)
    expect(previewCell(text, 80)).toEqual({ preview: text, truncated: false })
  })

  it('cuts exactly at the limit when one character does not fit', () => {
    const text = 'a'.repeat(81)
    const { preview, truncated } = previewCell(text, 80)
    expect(truncated).toBe(true)
    expect(preview).toHaveLength(81)
    expect(text.startsWith(preview.slice(0, -1))).toBe(true)
  })

  it('treats the empty value as fitting', () => {
    expect(previewCell('', 80)).toEqual({ preview: '', truncated: false })
  })
})

describe('TruncatedValue', () => {
  it('offers no disclosure for a value the cell can already show', () => {
    const html = renderToStaticMarkup(<TruncatedValue text="dictionary" limit={120} />)
    expect(html).toContain('dictionary')
    expect(html).not.toContain('Show full value')
    expect(html).not.toContain('aria-expanded')
  })

  it('previews a long value behind a focusable control, closed by default', () => {
    const html = renderToStaticMarkup(<TruncatedValue text={LONG} limit={80} />)
    expect(html).toContain('Show full value')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(`${escape(LONG.slice(0, 80))}…`)
  })

  it('never falls back to a native tooltip', () => {
    const html = renderToStaticMarkup(<TruncatedValue text={LONG} limit={80} mono />)
    expect(html).not.toMatch(/\stitle=/)
  })

  it('points the control at the text it controls, once that text exists', () => {
    const html = renderToStaticMarkup(<TruncatedValue text={LONG} limit={80} mono />)
    expect(html).toContain('type="button"')
    expect(html).toContain('font-mono')
    // Closed, there is no full-value region to control — an aria-controls that
    // named one would be a reference to nothing.
    expect(html).not.toContain('aria-controls')
  })
})
