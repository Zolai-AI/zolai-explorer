import { useQuery } from '@tanstack/react-query'
import { Activity, CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { HEALTH_URL, apiGetAbsolute, isApiError } from '../lib/api'
import { HealthSchema, parseOrThrow, type Health } from '../lib/schemas'
import { formatUptime } from '../lib/format'
import { Badge } from './ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '../lib/utils'

export type HealthLevel = 'ok' | 'degraded' | 'down'

/** Poll the public `/health` endpoint. No API key required. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }): Promise<Health> =>
      parseOrThrow(HealthSchema, await apiGetAbsolute<unknown>(HEALTH_URL, { signal }), 'health'),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  })
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

export function HealthPill({ className = '' }: { className?: string }) {
  const { data, isPending, error } = useHealth()
  const level = isPending ? 'degraded' : healthLevel(data, error)
  const style = STYLES[level]
  const Icon = ICONS[level]

  const statusText = isPending ? 'checking' : error ? 'unreachable' : data.status || 'unknown'

  const title = error
    ? `Health check failed: ${error instanceof Error ? error.message : 'unknown error'}`
    : data
      ? `status=${data.status} version=${data.version} uptime=${formatUptime(data.uptime_s)} data_root=${data.data_root}`
      : 'Checking /health…'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={style.variant}
          aria-live="polite"
          className={cn('max-lg:h-7 gap-1.5 font-medium', className)}
        >
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <>
              <span className="relative flex size-1.5">
                <span className={cn('absolute inline-flex size-full rounded-full opacity-60 animate-ping', style.dot)} />
                <span className={cn('relative inline-flex size-1.5 rounded-full', style.dot)} />
              </span>
              <Icon className="hidden size-3.5 sm:inline" aria-hidden />
            </>
          )}
          <span className="font-mono whitespace-nowrap">{statusText}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="font-mono">{title}</TooltipContent>
    </Tooltip>
  )
}
