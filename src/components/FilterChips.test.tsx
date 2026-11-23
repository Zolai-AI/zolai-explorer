/**
 * Applied-filter chips, in the node environment: `react-dom/server` is how this
 * repo renders without a DOM, and the source is read where a *stateful*
 * behaviour (the removal announcement) cannot be observed from static markup.
 *
 * What is pinned: a chip offers a real <button> only when the caller supplied a
 * remover; the button names the exact filter; "Clear all" appears only when it
 * would clear at least two chips; and nothing falls back to a native `title`
 * (WCAG 1.4.13 — a hover tooltip is unreachable by keyboard and gone on blur).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FilterChips, type FilterChip } from './FilterChips'

const SOURCE = readFileSync(fileURLToPath(new URL('./FilterChips.tsx', import.meta.url)), 'utf8')

const chip = (overrides: Partial<FilterChip>): FilterChip => ({
  id: 'chip',
  label: 'Label',
  value: 'value',
  ...overrides,
})

const removable = (id: string) => chip({ id, onRemove: () => undefined })
const countChip = chip({ id: 'count', label: 'Showing', value: '1 of 6 collections' })

describe('removable chips', () => {
  it('renders a real button named by the exact filter', () => {
    const html = renderToStaticMarkup(
      <FilterChips
        chips={[chip({ id: 'collection', label: 'Collection', value: 'Bible', onRemove: () => undefined })]}
      />,
    )

    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="Remove filter: Collection Bible"')
  })

  it('does not make the non-removable chip look interactive', () => {
    const html = renderToStaticMarkup(<FilterChips chips={[countChip]} />)

    // The count is information, not an action: no button, no ✕, no label.
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Remove filter')
    // The real numbers are still stated.
    expect(html).toContain('Showing:')
    expect(html).toContain('1 of 6 collections')
  })

  it('renders exactly one button per removable chip and none for the count', () => {
    const html = renderToStaticMarkup(<FilterChips chips={[removable('collection'), countChip]} />)
    expect(html.match(/<button/g)).toHaveLength(1)
  })
})

describe('clear all', () => {
  it('is absent with a single removable chip, even when a handler is passed', () => {
    const html = renderToStaticMarkup(
      <FilterChips chips={[removable('one'), countChip]} onClearAll={() => undefined} />,
    )
    expect(html).not.toContain('Clear all')
  })

  it('is absent with two removable chips when the caller passed no handler', () => {
    const html = renderToStaticMarkup(<FilterChips chips={[removable('one'), removable('two')]} />)
    expect(html).not.toContain('Clear all')
  })

  it('appears once it clears at least two removable chips', () => {
    const html = renderToStaticMarkup(
      <FilterChips chips={[removable('one'), removable('two'), countChip]} onClearAll={() => undefined} />,
    )
    expect(html).toContain('Clear all')
  })
})

describe('no native tooltips and one live region', () => {
  const variants = [
    renderToStaticMarkup(<FilterChips chips={[removable('one')]} />),
    renderToStaticMarkup(<FilterChips chips={[countChip]} />),
    renderToStaticMarkup(
      <FilterChips chips={[removable('one'), removable('two')]} onClearAll={() => undefined} />,
    ),
  ]

  it('never emits a title attribute', () => {
    for (const html of variants) expect(html).not.toMatch(/\stitle=/)
  })

  it('keeps a role="status" region even before anything is removed', () => {
    for (const html of variants) expect(html).toContain('role="status"')
  })

  it('announces a removal by the chip’s own label and value', () => {
    // A static render cannot click, so the message template is pinned in source:
    // the announcement must keep naming what was removed, not just "filter".
    expect(SOURCE).toContain('Filter removed: ${chip.label} ${chip.value}.')
    expect(SOURCE).not.toMatch(/\stitle=/)
  })
})
