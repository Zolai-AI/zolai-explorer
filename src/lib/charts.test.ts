import { describe, expect, it } from 'vitest'
import {
  curationPipeline,
  maxValue,
  rowIndexLabel,
  shareLabel,
  shareOfTotal,
  zeroBasedBarPercent,
} from './charts'

/**
 * Verbatim `GET /foundation/stats` payload — the `PipelineStatsResponse` field
 * names from `zolai/api/foundation_router.py`, as parsed by `FoundationStatsSchema`.
 */
const FOUNDATION_STATS = {
  raw_count: 128,
  staging_count: 37,
  canonical_count: 4812,
  evidence_count: 963,
  review_pending_count: 26,
  review_resolved_count: 814,
  batches_count: 4,
}

describe('zeroBasedBarPercent', () => {
  it('scales the largest value to the full width', () => {
    expect(zeroBasedBarPercent(100, 100)).toBe(100)
    expect(zeroBasedBarPercent(50, 100)).toBe(50)
  })

  it('always measures from zero, never from the minimum', () => {
    // A min/max-scaled bar would give 0% for the smallest of these; a
    // zero-scaled one keeps the true proportion.
    expect(zeroBasedBarPercent(10, 100)).toBe(10)
    expect(zeroBasedBarPercent(99, 100)).toBe(99)
  })

  it('renders a zero value as an empty bar instead of a minimum sliver', () => {
    expect(zeroBasedBarPercent(0, 100)).toBe(0)
  })

  it('never exceeds 100% or goes negative', () => {
    expect(zeroBasedBarPercent(150, 100)).toBe(100)
    expect(zeroBasedBarPercent(-5, 100)).toBe(0)
  })

  it('is safe with a zero or unknown maximum', () => {
    expect(zeroBasedBarPercent(5, 0)).toBe(0)
    expect(zeroBasedBarPercent(5, Number.NaN)).toBe(0)
    expect(zeroBasedBarPercent(Number.NaN, 10)).toBe(0)
  })
})

describe('shareOfTotal / shareLabel', () => {
  it('computes the share of the total rows', () => {
    expect(shareOfTotal(25, 100)).toBe(0.25)
    expect(shareLabel(25, 100)).toBe('25.0%')
  })

  it('keeps one decimal, so a 34% collection reads as 34.0%', () => {
    expect(shareLabel(338760, 995153)).toBe('34.0%')
  })

  it('never divides by zero', () => {
    expect(shareOfTotal(5, 0)).toBe(0)
    expect(shareLabel(5, 0)).toBe('0.0%')
  })

  it('never reports more than the whole', () => {
    expect(shareOfTotal(120, 100)).toBe(1)
  })
})

describe('curationPipeline — the real /foundation/stats payload', () => {
  it('reads the server field names, so CurationChart stops bailing out', () => {
    // `CurationChart` renders `null` when this list is empty. It was always
    // empty: the patterns matched "canonical" / "review pending" against keys
    // that the endpoint spells `canonical_count` / `review_pending_count`.
    const stats = curationPipeline(FOUNDATION_STATS)
    expect(stats.length).toBeGreaterThan(0)
    expect(stats).toContainEqual({ label: 'Canonical', count: 4812 })
    expect(stats).toContainEqual({ label: 'Review pending', count: 26 })
    expect(stats).toContainEqual({ label: 'Review resolved', count: 814 })
  })

  it('sorts the curation counters largest first', () => {
    expect(curationPipeline(FOUNDATION_STATS).map((stat) => stat.label)).toEqual([
      'Canonical',
      'Evidence',
      'Review resolved',
      'Raw',
      'Staging',
      'Review pending',
    ])
  })

  it('charts every documented counter and leaves batches_count out', () => {
    const labels = curationPipeline(FOUNDATION_STATS).map((stat) => stat.label)
    expect(labels).not.toContain('Batches')
    expect(labels).toHaveLength(6)
  })

  it('skips counters the deployment did not report', () => {
    expect(curationPipeline({ canonical_count: 12 })).toEqual([{ label: 'Canonical', count: 12 }])
    expect(curationPipeline({ batches_count: 4 })).toEqual([])
  })

  it('drops a counter that is not a real count', () => {
    const stats = curationPipeline({
      canonical_count: Number.NaN,
      staging_count: -1,
      raw_count: 3,
    } as Record<string, number>)
    expect(stats).toEqual([{ label: 'Raw', count: 3 }])
  })

  it('returns nothing for a missing payload, so the card is omitted', () => {
    expect(curationPipeline(null)).toEqual([])
    expect(curationPipeline(undefined)).toEqual([])
  })
})

describe('maxValue', () => {
  it('is the bar axis maximum', () => {
    expect(maxValue([3, 99, 12])).toBe(99)
  })

  it('is 0 for an empty or invalid set, which renders empty bars', () => {
    expect(maxValue([])).toBe(0)
    expect(maxValue([Number.NaN, -1])).toBe(0)
  })
})

describe('rowIndexLabel', () => {
  it('starts at zero, so the first row is 0 and not 1', () => {
    expect(rowIndexLabel(0)).toBe('0')
    expect(rowIndexLabel(1)).toBe('1')
    expect(rowIndexLabel(11)).toBe('11')
  })

  it('truncates a fractional index and floors a bad one at zero', () => {
    expect(rowIndexLabel(2.9)).toBe('2')
    expect(rowIndexLabel(-1)).toBe('0')
    expect(rowIndexLabel(Number.NaN)).toBe('0')
  })
})