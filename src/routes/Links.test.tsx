import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source guards for `/links`. The path column is the page's payload and is
 * already rendered as the element's own text, so the `title={path}` the anchor
 * and `<code>` used to carry was redundant, not a loss (candidate #8): the fix is
 * to drop it, not to build a disclosure around it.
 *
 * `<Card title=…>`/`<Empty title=…>` are visible-text props, so the ban is scoped
 * to the native elements that actually duplicated their own text.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./Links.tsx', import.meta.url)), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('Links — the path is shown, not repeated in a tooltip (candidate #8)', () => {
  it('no longer puts the path in a native title on the anchor or code cell', () => {
    expect(CODE).not.toMatch(/<(?:a|code)\b[^>]*\stitle=/i)
  })

  it('still renders the path itself as the element text', () => {
    // The value the tooltip duplicated is the visible content — the guard only
    // holds if the page still shows it.
    expect(CODE).toMatch(/<a\b[^>]*>[\s\S]*?\{path\}/)
    expect(CODE).toMatch(/<code\b[^>]*>\s*\{path\}/)
  })
})
