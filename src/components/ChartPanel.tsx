import type { ReactNode } from 'react'
import { ChartContainer, type ChartConfig } from './ui/chart'
import { Card } from './Card'
import { Empty } from './Empty'
import { ErrorPanel } from './ErrorState'
import { Skeleton } from './Skeleton'

/**
 * Every chart in the app goes through this wrapper so loading, error and empty
 * states are impossible to forget.
 *
 * - **No horizontal overflow at 375px**: the body is `min-w-0` and the chart
 *   width is `w-full`, so `ResponsiveContainer` measures the card, not the
 *   viewport.
 * - **No colour in this file.** Series are painted by the shadcn `chart`
 *   primitive from `config`, which references `var(--color-chart-N)`.
 * - **Accessible**: the plot is wrapped in `role="img"` with an `aria-label`,
 *   and the numbers behind it are always present in text elsewhere on the page
 *   (table rows / tooltips), so the chart is a supplement rather than the only
 *   way to read the data.
 * - **Layout-stable**: the chart box keeps its height while `isPending`, so
 *   swapping a skeleton for an `<svg>` never shifts the page.
 */
export function ChartPanel({
  title,
  subtitle,
  actions,
  config,
  isPending = false,
  isError = false,
  error,
  onRetry,
  isEmpty = false,
  emptyTitle = 'No data',
  emptyHint,
  height = 240,
  ariaLabel,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** shadcn `ChartConfig` — the only place series colours are declared. */
  config: ChartConfig
  isPending?: boolean
  isError?: boolean
  error?: unknown
  onRetry?: () => void
  isEmpty?: boolean
  emptyTitle?: string
  emptyHint?: ReactNode
  /** Plot height in px; the container is always this tall. */
  height?: number
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={actions}
      className="min-w-0"
      bodyClassName="min-w-0"
    >
      <div className="w-full" style={{ minHeight: height }}>
        {isPending ? (
          <div className="flex flex-col justify-end gap-2" style={{ height }} aria-busy="true">
            <Skeleton className="h-full w-full" />
            <span className="sr-only">Loading chart…</span>
          </div>
        ) : isError ? (
          <ErrorPanel error={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <Empty title={emptyTitle} hint={emptyHint} />
        ) : (
          <div
            role="img"
            aria-label={ariaLabel}
            className="w-full"
            style={{ height }}
          >
            <ChartContainer config={config} className="h-full w-full aspect-auto">
              {children}
            </ChartContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
