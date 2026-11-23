import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CircleAlert, CircleCheck, Loader2, Pause } from 'lucide-react'
import { isApiError } from '../lib/api'
import { describeError } from './ErrorState'
import type { Health } from '../lib/schemas'
import { formatUptime } from '../lib/format'
import { relativeFetched } from './DataFreshness'
import { useHealthPollPaused } from '../lib/healthPoll'
import { healthDisplaySpec } from './HealthObserver'
import { Badge } from './ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '../lib/utils'

export type HealthLevel = 'ok' | 'degraded' | 'down'

/**
 * Read the health status for display. This is a **display observer**: it shares
 * the `['health']` cache with the poll but pins `refetchInterval` to `false`, so
 * it never owns the loop. The single timer lives in `HealthObserver`, mounted by
 * the shell — which is what makes the poll (and the pause control) behave the
 * same at every viewport width, instead of running only while the ⋯ menu that
 * holds the pill happens to be open.
 */
export function useHealth() {
  return useQuery(healthDisplaySpec())
}

export function healthLevel(data: Health | undefined, error: unknown): HealthLevel {
  if (error) return isApiError(error) && error.status === 0 ? 'down' : 'down'
  if (!data) return 'degraded'
  const status = data.status.toLowerCase()
  if (status === 'ok' || status === 'healthy' || status === 'pass') return 'ok'
  if (status === 'degraded') return 'degraded'
  if (status === 'down' || status === 'error') return 'down'
  return 'degraded'
}

const STYLES: Record<HealthLevel, { dot: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ok: { dot: 'bg-emerald-500', variant: 'default' },
  degraded: { dot: 'bg-amber-500', variant: 'secondary' },
  down: { dot: 'bg-destructive', variant: 'destructive' },
}

const ICONS: Record<HealthLevel, typeof Activity> = {
  ok: CircleCheck,
  degraded: CircleAlert,
  down: Activity,
}

/** Re-render cadence for the paused age label — matches `DataFreshness`. */
const AGE_TICK_MS = 30_000

export function HealthPill({ className = '' }: { className?: string }) {
  const [paused] = useHealthPollPaused()
  const { data, isPending, error, dataUpdatedAt } = useHealth()
  const level = isPending ? 'degraded' : healthLevel(data, error)
  const style = STYLES[level]
  const Icon = ICONS[level]

  // Nothing refetches while paused, so the age would freeze at whatever it
  // first read; this keeps "checked 4 min ago" telling the truth.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!paused) return
    const id = globalThis.window?.setInterval?.(() => setTick((tick) => tick + 1), AGE_TICK_MS)
    return () => globalThis.window?.clearInterval?.(id)
  }, [paused])

  // Paused is said on the badge, not only in the tooltip: hover-persistent
  // content fails WCAG 1.4.13, and a stopped poll still showing "ok" reads as a
  // live reading. Kept to one short word — the pill is inline from `lg` only,
  // because its longest label must not be able to overflow the bar.
  const statusText = paused
    ? 'paused'
    : isPending
      ? 'checking'
      : error
        ? 'unreachable'
        : data.status || 'unknown'

  const checked = relativeFetched(dataUpdatedAt, Date.now())

  const detail = error
    // Classified, not echoed — "Failed to fetch" is browser plumbing, and the
    // tooltip is screenshot-able.
    ? `Health check failed: ${describeError(error).message}`
    : data
      ? [
          `status=${data.status}`,
          `version=${data.version}`,
          `uptime=${formatUptime(data.uptime_s)}`,
          data.engine_mode ? `engine=${data.engine_mode}` : null,
          // Only pair llm with engine_mode -- older payloads omit both and bool.catch
          // would otherwise print a false "llm=off".
          data.engine_mode ? (data.llm_allowed ? 'llm=allowed' : 'llm=off') : null,
          // The data root is deliberately NOT shown here: its value is a
          // container filesystem path (implementation detail), and this
          // tooltip is screenshot-able prose on an anonymous surface.
        ]
          .filter(Boolean)
          .join(' ')
      : null

  // `dataUpdatedAt` is this browser's receive time, so the age is verifiable
  // rather than a guess; with no reading yet there is no age to state.
  const lastRead = checked === null ? 'never checked' : `checked ${checked}`
  const title = paused
    ? `auto-refresh paused · ${lastRead} · ${detail ?? 'no reading yet'}`
    : (detail ?? 'Checking /health…')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={style.variant}
          aria-live="polite"
          className={cn('max-lg:h-7 gap-1.5 font-medium', className)}
        >
          {isPending && !paused ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <>
              <span className="relative flex size-1.5">
                {/* The ping is a liveness signal; a stopped poll must not move. */}
                <span
                  className={cn(
                    'absolute inline-flex size-full rounded-full opacity-60',
                    !paused && 'animate-ping',
                    style.dot,
                  )}
                />
                <span className={cn('relative inline-flex size-1.5 rounded-full', style.dot)} />
              </span>
              {paused ? (
                <Pause className="size-3 shrink-0" aria-hidden />
              ) : (
                <Icon className="hidden size-3.5 sm:inline" aria-hidden />
              )}
            </>
          )}
          <span className="font-mono whitespace-nowrap">{statusText}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="font-mono">{title}</TooltipContent>
    </Tooltip>
  )
}
