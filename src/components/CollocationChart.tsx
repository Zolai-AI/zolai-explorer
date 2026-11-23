import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { ChartPanel } from './ChartPanel'
import { assignSeriesKeys, collocationMetric, collocationSeries } from '../lib/charts'
import { multiSeriesConfig } from '../lib/chartSeries'
import { formatCount, formatScore } from '../lib/format'
import type { Collocation } from '../lib/schemas'

/**
 * Collocation strength for the word currently being explored.
 *
 * The endpoint returns `pmi` for every row, but the deployed API reports
 * `pmi: 0.0` throughout (PMI is not computed server-side yet). Rather than draw
 * a chart of zeros, `collocationMetric` picks PMI only when at least one row is
 * actually scored, and otherwise falls back to the real `frequency`. The
 * subtitle always says which one is plotted — the same rule the table's
 * "0 (not scored)" cell follows.
 *
 * It takes only resolved rows: the parent `CollocationsPanel` renders the
 * skeleton and error states before this draws, so loading/error props here
 * would only ever be constants.
 *
 * The row rhythm — label size, value-label gutter, plot height — matches the
 * `BarList` charts in `Charts.tsx` (tick/label `fontSize: 11`, right margin
 * `56`, the panel's default height) rather than the smaller ad-hoc values it
 * once carried, which made these rows read cramped next to every other chart
 * in the app (issue #23, item 3).
 */
export function CollocationChart({ rows }: { rows: readonly Collocation[] }) {
  const metric = useMemo(() => collocationMetric(rows), [rows])
  const points = useMemo(() => collocationSeries(rows, metric, 8), [rows, metric])
  const config = useMemo(() => multiSeriesConfig(points.map((point) => point.label)), [points])

  const subtitle =
    metric === 'pmi'
      ? 'GET /word/{w}/collocations — top partners by pointwise mutual information'
      : 'GET /word/{w}/collocations — PMI is unscored (0) for every row, so this plots raw frequency'

  return (
    <ChartPanel
      title="Top collocations"
      subtitle={subtitle}
      config={config}
      isEmpty={points.length === 0}
      emptyTitle="No collocations to plot"
      emptyHint="The live endpoint returned an empty collocation list for this word."
      ariaLabel={`Top collocations by ${metric === 'pmi' ? 'PMI' : 'frequency'}: ${points
        .map(
          (point) =>
            `${point.label} ${
              metric === 'pmi' ? formatScore(point.value) : formatCount(point.value)
            }`,
        )
        .join('; ')}`}
    >
      <BarChart
        data={points as { label: string; value: number }[]}
        layout="vertical"
        margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
        barCategoryGap="22%"
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={104}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          interval={0}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {assignSeriesKeys(points).map((point) => (
            <Cell key={point.label} fill={point.color} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            className="tabular-nums"
            fill="currentColor"
            fontSize={11}
            formatter={(value: unknown) =>
              metric === 'pmi' ? formatScore(Number(value)) : formatCount(Number(value))
            }
          />
        </Bar>
      </BarChart>
    </ChartPanel>
  )
}
