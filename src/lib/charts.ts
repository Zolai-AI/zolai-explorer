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

/** Keys of `/foundation/stats` describing curation state. */
const CURATION_PATTERNS: readonly RegExp[] = [
  /^canonical$/i,
  /^staging$/i,
  /^raw$/i,
  /^review pending$/i,
  /^review resolved$/i,
  /^evidence$/i,
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

/** Curation/review counters from `/foundation/stats`, when it is reachable. */
export function curationPipeline(
  stats: Record<string, number> | null | undefined,
): Stat[] {
  if (!stats) return []
  return matchKeys(stats, CURATION_PATTERNS).filter(
    (stat) => Number.isFinite(stat.count) && stat.count >= 0,
  )
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
