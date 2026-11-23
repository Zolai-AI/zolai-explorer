import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { BarChart3, GitBranch, Layers3 } from 'lucide-react'
import { ChartPanel } from './ChartPanel'
import { Notice } from './Notice'
import {
  assignSeriesKeys,
  corpusComposition,
  curationPipeline,
  knowledgePipeline,
  type Stat,
} from '../lib/charts'
import { multiSeriesConfig } from '../lib/chartSeries'
import { isApiError } from '../lib/api'
import { formatCount } from '../lib/format'

/**
 * Horizontal bar charts over `GET /knowledge/statistics` and, when the
 * deployment registers it, `GET /foundation/stats`.
 *
 * Orientation is deliberate: the API's collection names are human sentences
 * ("EN→ZO entries"), so they read far better as `YAxis` category labels, and a
 * horizontal bar keeps a 375px viewport scroll-free.
 *
 * `labelList` prints the exact count on every bar — the chart is a visual index,
 * the "All collections" table below stays the authoritative readout.
 */

/** Largest categories first so the tail can be dropped without losing the shape. */
function truncate(items: readonly Stat[], limit: number): Stat[] {
  return items.slice(0, limit)
}

function BarList({ items }: { items: readonly Stat[] }) {
  return (
    <BarChart
      data={items as Stat[]}
      layout="vertical"
      margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
      barCategoryGap="22%"
    >
      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
      <XAxis type="number" hide />
      <YAxis
        type="category"
        dataKey="label"
        width={132}
        tickLine={false}
        axisLine={false}
        tick={{ fontSize: 11 }}
        interval={0}
      />
      <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
        {assignSeriesKeys(items).map((point) => (
          <Cell key={point.label} fill={point.color} />
        ))}
        <LabelList
          dataKey="count"
          position="right"
          className="tabular-nums"
          fill="currentColor"
          fontSize={11}
          formatter={(value: unknown) => formatCount(Number(value))}
        />
      </Bar>
    </BarChart>
  )
}

export function CorpusChart({
  stats,
  isPending,
  isError,
  error,
  onRetry,
}: {
  stats: Record<string, number> | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}) {
  const items = useMemo(() => truncate(corpusComposition(stats), 8), [stats])
  const config = useMemo(() => multiSeriesConfig(items.map((item) => item.label)), [items])

  return (
    <ChartPanel
      title="Corpus composition"
      subtitle="GET /knowledge/statistics — the eight largest corpus collections"
      actions={<BarChart3 className="text-muted-foreground/70" aria-hidden />}
      config={config}
      isPending={isPending}
      isError={isError}
      error={error}
      onRetry={onRetry}
      isEmpty={items.length === 0}
      emptyTitle="No corpus counts reported"
      emptyHint="The endpoint returned none of the dictionary, Bible, lexicon or pattern collections."
      ariaLabel={`Corpus composition: ${items
        .map((item) => `${item.label} ${formatCount(item.count)} rows`)
        .join('; ')}`}
    >
      <BarList items={items} />
    </ChartPanel>
  )
}

export function PipelineChart({
  stats,
  isPending,
  isError,
  error,
  onRetry,
}: {
  stats: Record<string, number> | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}) {
  const items = useMemo(() => knowledgePipeline(stats), [stats])
  const config = useMemo(() => multiSeriesConfig(items.map((item) => item.label)), [items])

  return (
    <ChartPanel
      title="Knowledge pipeline"
      subtitle="GET /knowledge/statistics — claims, hypotheses, evidence and the KG"
      actions={<GitBranch className="text-muted-foreground/70" aria-hidden />}
      config={config}
      isPending={isPending}
      isError={isError}
      error={error}
      onRetry={onRetry}
      isEmpty={items.length === 0}
      emptyTitle="Pipeline counters unavailable"
      emptyHint="The endpoint reported no knowledge-claims, hypotheses or evidence keys."
      ariaLabel={`Knowledge pipeline: ${items
        .map((item) => `${item.label} ${formatCount(item.count)}`)
        .join('; ')}`}
    >
      <BarList items={items} />
    </ChartPanel>
  )
}

/**
 * Curation counters from the optional `/foundation/stats`.
 *
 * Three states, deliberately kept apart (an invisible panel reads as "this
 * deployment has no curation data", which is a different claim from each of
 * them):
 * - **not exposed** — the endpoint only exists when the deployment registers the
 *   foundation router, so a 404 renders one honest muted line instead of a
 *   panel that quietly disappears. The panel is still an addition, not a promise.
 * - **failed** — anything else (network, timeout, 5xx) goes through the shared
 *   chart error surface with a retry, like every other chart here.
 * - **answered with no counters** — the empty state, which names the endpoint.
 */
export function CurationChart({
  stats,
  isPending,
  isError,
  error,
  onRetry,
}: {
  stats: Record<string, number> | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}) {
  const items = useMemo(() => curationPipeline(stats), [stats])
  const config = useMemo(() => multiSeriesConfig(items.map((item) => item.label)), [items])

  if (isError && isApiError(error) && error.status === 404) {
    return (
      <Notice
        tone="info"
        icon={<Layers3 className="size-4" aria-hidden />}
        title="Curation counters not exposed"
      >
        <span className="font-mono">GET /foundation/stats</span> answered 404 — this deployment does
        not register the foundation router, so curation state is not served here at all. Nothing was
        hidden: the panel is an addition, not a promise.
      </Notice>
    )
  }

  return (
    <ChartPanel
      title="Curation state"
      subtitle="GET /foundation/stats — canonical, staging, raw and review queues"
      actions={<Layers3 className="text-muted-foreground/70" aria-hidden />}
      config={config}
      isPending={isPending}
      isError={isError}
      error={error}
      onRetry={onRetry}
      isEmpty={items.length === 0}
      emptyTitle="No curation counters"
      emptyHint="The endpoint answered but reported no counters."
      ariaLabel={`Curation state: ${items
        .map((item) => `${item.label} ${formatCount(item.count)}`)
        .join('; ')}`}
    >
      <BarList items={items} />
    </ChartPanel>
  )
}
