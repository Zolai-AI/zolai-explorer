/**
 * Candidate #10 — the Dashboard empties.
 *
 * The collection-totals empty used to read "The API returned no collections. The
 * versioned surface may require an API key." — two defects in one sentence: a
 * single successful-but-empty response cannot support a claim about what the
 * server *requires*, and it named "an API key" when a session may be the
 * credential in play. An empty panel in this app must name its endpoint and the
 * one control that changes the answer (here `stats.refetch()`), not guess at a
 * server rule.
 *
 * The page needs four queries and providers, which a node static render cannot
 * mount in the empty branch, so these are source guards (the way `Data.test.tsx`
 * and `Review.test.tsx` pin their own copy) plus one pure assertion that the
 * endpoint string the copy interpolates really is the versioned statistics
 * route.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS_BY_ID, publicPath } from '../lib/endpoints'
import { STATISTICS_PATH } from './Dashboard'

/** Comment-stripped source: prose must neither fail nor satisfy a code guard. */
const CODE = readFileSync(fileURLToPath(new URL('./Dashboard.tsx', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')

describe('STATISTICS_PATH', () => {
  it('is the versioned statistics endpoint, read from the registry', () => {
    expect(STATISTICS_PATH).toBe('/api/v1/knowledge/statistics')
    expect(STATISTICS_PATH).toBe(publicPath(ENDPOINTS_BY_ID['knowledge.statistics']))
  })
})

describe('Dashboard empties — honest, address-naming', () => {
  it('drops the server-capability claim one empty response cannot support', () => {
    expect(CODE).not.toContain('may require an API key')
    expect(CODE).not.toContain('The API returned no collections')
    // A session may be the credential, so no empty here speaks of "an API key".
    expect(CODE).not.toMatch(/require an API key/i)
  })

  it('every empty names the endpoint it asked', () => {
    // Both the collection-totals empty and the All-collections empty interpolate
    // the versioned path — the rule is that a panel states its address.
    expect((CODE.match(/GET \$\{STATISTICS_PATH\}/g) ?? []).length).toBe(2)
  })

  it('names the one control that would change the answer', () => {
    expect(CODE).toContain('Refresh re-asks the same endpoint')
  })

  it('states distinct true things, not the same guess twice', () => {
    // The totals empty is about *tiling* (a response may list collections the
    // tiles do not cover); the table empty is about an *empty response*. The
    // conditions differ, so the copy must differ and must not duplicate one
    // guess in both places.
    expect(CODE).toContain('this panel has a tile for')
    expect(CODE).toContain('empty stats object')
  })
})
