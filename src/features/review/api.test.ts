/**
 * Transport guards for the review queue.
 *
 * The bug this pins: `useListRecords` accepted a `cursor`, folded it into the
 * query key, and then never put it on the wire — so clicking "Next" re-fetched
 * page 1 forever and the cursor pagination was a silent no-op. The server takes
 * `cursor` as an **opaque id of the last item seen** (`WHERE id > ?`,
 * `zolai-core/zolai/api/records_router.py:92`), so it must travel as a query
 * parameter and must never be arithmetic-edited as though it were an offset.
 */
import { describe, expect, it } from 'vitest'
import { recordsPath, type RecordsParams } from './api'

const base: RecordsParams = { table: 'dictionary', limit: 50 }

describe('recordsPath — pagination must reach the server', () => {
  it('sends the required table and the limit on the first page', () => {
    const url = recordsPath(base)
    expect(url).toContain('table=dictionary')
    expect(url).toContain('limit=50')
    expect(url).not.toContain('cursor')
  })

  it('sends `cursor` when one is supplied — the bug this pins', () => {
    expect(recordsPath({ ...base, cursor: 12_345 })).toContain('cursor=12345')
  })

  it('treats cursor 0 as a real value, not as absent', () => {
    // `WHERE id > 0` is page one; dropping it silently changes nothing, but a
    // `cursor !== undefined && cursor` truthiness test would.
    expect(recordsPath({ ...base, cursor: 0 })).toContain('cursor=0')
  })

  it('encodes the free-text filter', () => {
    expect(recordsPath({ ...base, q: 'pasi an?' })).toContain('q=pasi+an%3F')
  })

  it('omits an empty filter rather than sending min_length=1 garbage', () => {
    expect(recordsPath({ ...base, q: '' })).not.toContain('q=')
    expect(recordsPath({ ...base, q: '   ' })).not.toContain('q=')
  })

  it('carries table, cursor and filter together without dropping any', () => {
    const url = recordsPath({ table: 'bible_verses', q: 'pasian', limit: 25, cursor: 900 })
    expect(url).toContain('table=bible_verses')
    expect(url).toContain('cursor=900')
    expect(url).toContain('q=pasian')
    expect(url).toContain('limit=25')
  })

  it('defaults the limit server-side-defaulted to 50', () => {
    expect(recordsPath({ table: 'phrases' })).toContain('limit=50')
  })
})
