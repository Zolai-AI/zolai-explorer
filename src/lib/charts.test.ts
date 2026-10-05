import { describe, expect, it } from 'vitest'
import {
  maxValue,
  rowIndexLabel,
  shareLabel,
  shareOfTotal,
  zeroBasedBarPercent,
} from './charts'

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