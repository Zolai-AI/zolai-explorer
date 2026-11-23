import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source guards for `/rag`. The page is a user-triggered POST mutation with no
 * result on first paint, so its retrieval panels are not reachable through a
 * static render here — the honest check is against the file itself.
 *
 * The regression pinned: the fixed snippet count was visible ("10 — fixed by the
 * server") but the *reason* it is fixed lived only in a native `title=` tooltip —
 * hover-only, no keyboard route, invisible on touch (WCAG 1.4.13). The reason is
 * now visible subtext, and no `title=` survives on a native element. `<Card
 * title=…>`/`<Empty title=…>`/`<PageHeader title=…>` are visible-text props, so
 * the ban is scoped to lowercase elements — the same boundary `Review.test.tsx`
 * draws.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./Rag.tsx', import.meta.url)), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const PROVIDER_CODE = readFileSync(
  fileURLToPath(new URL('../components/ProviderModelSelect.tsx', import.meta.url)),
  'utf8',
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('form rows — controls share one label line', () => {
  it('top-aligns the RAG row, not the taller Snippets cell', () => {
    // `items-end` aligned bottoms against a cell that also carries the
    // explanation text, leaving the button and the labels below/above the input.
    expect(CODE).toContain('sm:items-start')
    expect(CODE).not.toContain('sm:items-end')
  })

  it('top-aligns the provider picker row for the same reason', () => {
    expect(PROVIDER_CODE).toContain('sm:items-start')
    expect(PROVIDER_CODE).not.toContain('sm:items-end')
  })
})

describe('Rag — the fixed-snippet reason is visible, not a tooltip (candidate #8)', () => {
  it('states the reason as visible subtext', () => {
    expect(CODE).toContain('returns 10 snippets regardless of the')
    expect(CODE).toContain('10 — fixed by the server')
  })

  it('leaves no native title tooltip on any element', () => {
    expect(CODE).not.toMatch(/<(?:span|div|p|code|kbd|svg|input|a|button)\b[^>]*\stitle=/i)
  })
})
