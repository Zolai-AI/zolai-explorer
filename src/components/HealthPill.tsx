import { useQuery } from '@tanstack/react-query'
import { Activity, CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { HEALTH_URL, apiGetAbsolute, isApiError } from '../lib/api'
import { HealthSchema, parseOrThrow, type Health } from '../lib/schemas'
import { formatUptime } from '../lib/format'

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

const STYLES: Record<HealthLevel, { dot: string; text: string; ring: string }> = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-500/30 bg-emerald-500/10' },
  degraded: {
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    ring: 'border-amber-500/30 bg-amber-500/10',
  },
  down: { dot: 'bg-rose-400', text: 'text-rose-300', ring: 'border-rose-500/30 bg-rose-500/10' },
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
    <span
      title={title}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.ring} ${style.text} ${className}`}
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <>
          <span className="relative flex size-1.5">
            <span className={`absolute inline-flex size-full rounded-full ${style.dot} opacity-60`} />
            <span className={`relative inline-flex size-1.5 rounded-full ${style.dot}`} />
          </span>
          <Icon className="hidden size-3.5 sm:inline" aria-hidden />
        </>
      )}
      <span className="font-mono whitespace-nowrap">{statusText}</span>
      {!isPending && !error && (
        <span className="hidden font-mono whitespace-nowrap text-slate-400 sm:inline">
          · {formatUptime(data.uptime_s)}
        </span>
      )}
    </span>
  )
}