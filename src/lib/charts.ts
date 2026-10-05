/**
 * Chart data derivation — pure functions from API payloads to Recharts series.
 *
 * Two rules drive everything here:
 *
 * 1. **No invented data.** Every series is derived from a field the live API
 *    actually returned. If the source is missing or empty, the caller renders an
 *    `Empty` state instead of a chart.
 * 2. **No colours in code.** Series are keyed (`value1`…`value5`) and coloured by
 *    the shadcn `chart` primitive from `--chart-N`, so light/dark repaint on
 *    theme toggle. Nothing in this module returns a colour.
 */

import { CHART_SERIES, type ChartSeriesKey } from './chartSeries'

export type Stat = { label: string; count: number }

export type SeriesPoint = { label: string; value: number }

/** Keys of `/knowledge/statistics` that describe the corpus, not the pipeline. */
const CORPUS_PATTERNS: readonly RegExp[] = [
  /^dictionary entries$/i,
  /^EN→ZO entries$/i,
  /^vocabulary items$/i,
  /^Bible verses$/i,
  /^phrases$/i,
  /^grammar patterns$/i,
  /^collocations$/i,
]

/** Keys of `/knowledge/statistics` that describe the knowledge pipeline. */
const PIPELINE_PATTERNS: readonly RegExp[] = [
  /^knowledge claims$/i,
  /^hypotheses$/i,
  /^evidence$/i,
  /^KG nodes$/i,
  /^KG edges$/i,
]

/**
 * Curation counters of `GET /foundation/stats`, keyed by the field the server
 * sends and labelled for the reader (the panel itself sorts largest first).
 *
 * The endpoint answers **field names** — `canonical_count`, `review_pending_count`,
 * … (`PipelineStatsResponse` in `zolai/api/foundation_router.py`) — not the human
 * labels. An earlier version matched the words "canonical" / "review pending"
 * against the payload keys, which never matched a single key, so
 * `CurationChart` always found zero items and returned `null`: a chart that can
 * never render. Match the fields the server actually sends, and print the label
 * a human reads.
 *
 * `batches_count` is deliberately absent: it counts ingest batches, not the
 * curation state this card is about.
 */
const CURATION_FIELDS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'canonical_count', label: 'Canonical' },
  { key: 'staging_count', label: 'Staging' },
  { key: 'raw_count', label: 'Raw' },
  { key: 'evidence_count', label: 'Evidence' },
  { key: 'review_pending_count', label: 'Review pending' },
  { key: 'review_resolved_count', label: 'Review resolved' },
]

function matchKeys(stats: Record<string, number>, patterns: readonly RegExp[]): Stat[] {
  return Object.entries(stats)
    .filter(([label]) => patterns.some((pattern) => pattern.test(label)))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Corpus composition, largest first. Defaults to 8 collections so the
 * horizontal axis stays legible at 375px; a smaller `limit` wins.
 */
export function corpusComposition(
  stats: Record<string, number> | null | undefined,
  limit = 8,
): Stat[] {
  if (!stats) return []
  return matchKeys(stats, CORPUS_PATTERNS)
    .filter((stat) => Number.isFinite(stat.count) && stat.count >= 0)
    .slice(0, Math.max(0, limit))
}

/**
 * Knowledge pipeline: claims → hypotheses → evidence plus the KG graph size.
 * Returns `[]` when the endpoint reported none of those keys so the card can
 * show an empty state rather than a chart of nothing.
 */
export function knowledgePipeline(
  stats: Record<string, number> | null | undefined,
): Stat[] {
  if (!stats) return []
  return matchKeys(stats, PIPELINE_PATTERNS).filter(
    (stat) => Number.isFinite(stat.count) && stat.count >= 0,
  )
}

/**
 * Curation/review counters from `/foundation/stats`, when it is reachable.
 *
 * Returns `[]` for a missing payload or a response without any of the documented
 * counters, so `CurationChart` renders nothing instead of a chart of nothing.
 */
export function curationPipeline(
  stats: Record<string, number> | null | undefined,
): Stat[] {
  if (!stats) return []
  return CURATION_FIELDS.filter(({ key }) => Number.isFinite(stats[key]))
    .map(({ key, label }) => ({ label, count: stats[key] }))
    .filter((stat) => stat.count >= 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * Which metric a collocation chart can honestly plot.
 *
 * The live `/word/{w}/collocations` payload reports `pmi: 0.0` for every row
 * (PMI is not computed server-side yet). Plotting that would be a chart of
 * nothing, so we fall back to `frequency` — which is real — and let the caller
 * say so in the subtitle.
 */
export function collocationMetric(
  rows: readonly { pmi?: number; frequency?: number }[] | null | undefined,
): 'pmi' | 'frequency' {
  if (!rows) return 'frequency'
  return rows.some((row) => typeof row.pmi === 'number' && row.pmi !== 0) ? 'pmi' : 'frequency'
}

/** Top-N collocations by the chosen metric, largest first, ties broken by name. */
export function collocationSeries(
  rows: readonly { word1?: string; word2?: string; pmi?: number; frequency?: number }[] | null | undefined,
  metric: 'pmi' | 'frequency',
  limit = 8,
): SeriesPoint[] {
  if (!rows) return []
  return rows
    .map((row) => ({
      label: [row.word1, row.word2].filter(Boolean).join(' · '),
      value: metric === 'pmi' ? (row.pmi ?? 0) : (row.frequency ?? 0),
    }))
    .filter((point) => point.label !== '' && Number.isFinite(point.value))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit))
}

/**
 * Map a series of labels onto the five chart slots, cycling `chart-1..5`.
 * Export keeps the palette assignment unit-testable without React.
 */
export function assignSeriesKeys<T extends { label: string }>(
  points: readonly T[],
): (T & { key: ChartSeriesKey; color: string })[] {
  return points.map((point, index) => ({
    ...point,
    key: CHART_SERIES[index % CHART_SERIES.length],
    color: `var(--color-${CHART_SERIES[index % CHART_SERIES.length]})`,
  }))
}

/* ------------------------------------------------- zero-based value bars */

/**
 * Bar length as a percentage of `max`, **always measured from zero**.
 *
 * A bar that starts at the minimum of the data ("min/max scaling") makes a
 * collection of similar counts look wildly different — a 1%-floor bar is just as
 * misleading. The caller shows the number next to the bar, so the honest rule is
 * one: width = value / largest value, and nothing else.
 */
export function zeroBasedBarPercent(value: number, max: number, digits = 1): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  const ratio = Math.max(0, value) / max
  return Math.min(100, Number((ratio * 100).toFixed(digits)))
}

/** A value's share of the total, in `0…1`; a zero total yields `0`. */
export function shareOfTotal(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Math.min(1, Math.max(0, value / total))
}

/** `34.0%` — the value as a share of the total rows. */
export function shareLabel(value: number, total: number, digits = 1): string {
  return `${(shareOfTotal(value, total) * 100).toFixed(digits)}%`
}

/** The largest value in a set, used as the bar axis maximum. */
export function maxValue(values: readonly number[]): number {
  return values.reduce<number>((max, value) => {
    if (!Number.isFinite(value) || value < 0) return max
    return Math.max(max, value)
  }, 0)
}

/** Zero-based row index label: the first row of a list is `0`, never `1`. */
export function rowIndexLabel(index: number): string {
  if (!Number.isFinite(index)) return '0'
  return String(Math.max(0, Math.trunc(index)))
}
