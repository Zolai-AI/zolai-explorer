/**
 * The five chart series slots and their shadcn `ChartConfig` entries.
 *
 * Every colour is `var(--color-chart-N)`, which Tailwind's `@theme inline`
 * resolves to `var(--chart-N)`. Those tokens are redefined in the `.dark` block
 * of `src/index.css`, so a theme toggle repaints every chart with **no
 * component change and no inline colour**. Nothing in this file (or in any
 * component) may hardcode a hex/oklch value for a series.
 */

import type { ChartConfig } from '../components/ui/chart'

export const CHART_SERIES = ['value1', 'value2', 'value3', 'value4', 'value5'] as const

export type ChartSeriesKey = (typeof CHART_SERIES)[number]

const seriesColors: Record<ChartSeriesKey, string> = {
  value1: 'var(--color-chart-1)',
  value2: 'var(--color-chart-2)',
  value3: 'var(--color-chart-3)',
  value4: 'var(--color-chart-4)',
  value5: 'var(--color-chart-5)',
}

export function seriesColor(key: ChartSeriesKey): string {
  return seriesColors[key]
}

/**
 * A single-series chart config. `label` is the accessible/legend name; Recharts
 * reads `payload[key]` for the value, so the bar/area uses `dataKey="value"`.
 */
export function singleSeriesConfig(label: string, key: ChartSeriesKey = 'value1'): ChartConfig {
  return { [key]: { label, color: seriesColors[key] } }
}

/** A multi-series chart config, e.g. one bar per collection coloured by index. */
export function multiSeriesConfig(labels: readonly string[]): ChartConfig {
  return labels.reduce<ChartConfig>((config, label, index) => {
    const key = CHART_SERIES[index % CHART_SERIES.length]
    config[key] = { label, color: seriesColors[key] }
    return config
  }, {})
}
