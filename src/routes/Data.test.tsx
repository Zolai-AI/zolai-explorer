/**
 * `/data` used to explain its one filter in prose ("Showing one collection from
 * the dashboard link: …"), so the applied filter and the result count could not
 * be read apart. These are source guards (the page needs a router and three
 * queries, which a static render cannot mount) pinning the replacement: the
 * prose block is gone, the chip row is rendered, the count comes from the
 * payload, and the empty state names the chip's ✕ instead of a link that no
 * longer exists.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(fileURLToPath(new URL('./Data.tsx', import.meta.url)), 'utf8')

describe('/data applied-filter chips', () => {
  it('no longer explains the filter in prose or offers the old link', () => {
    expect(SOURCE).not.toContain('Showing one collection from')
    expect(SOURCE).not.toContain('Show all collections')
  })

  it('renders the chip row and drops ?collection= through the route registry', () => {
    expect(SOURCE).toContain("from '../components/FilterChips'")
    expect(SOURCE).toContain('<FilterChips')
    // Removing the collection chip is exactly what the old link did.
    expect(SOURCE).toContain("navigate(pathOf('data'))")
  })

  it('states the filtered count from the payload, never a computed total', () => {
    expect(SOURCE).toContain('filtered.length')
    expect(SOURCE).toContain('of ${formatCount(rows.length)}')
  })

  it('keeps the empty state honest and names the chip’s ✕', () => {
    // The label still came from a dashboard link; only its removal affordance moved.
    expect(SOURCE).toContain('The dashboard linked a label')
    expect(SOURCE).toContain('✕')
    expect(SOURCE).not.toContain('Show all collections to see what is live')
  })
})
