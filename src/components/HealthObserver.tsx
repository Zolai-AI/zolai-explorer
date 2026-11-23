import { useQuery, type QueryFunctionContext, type UseQueryOptions } from '@tanstack/react-query'
import { HEALTH_URL, apiGetAbsolute } from '../lib/api'
import { HealthSchema, parseOrThrow, type Health } from '../lib/schemas'
import { useHealthPollPaused } from '../lib/healthPoll'

/**
 * The single `/health` poll observer.
 *
 * Before this, the 30s loop was owned by whichever component happened to mount
 * `useHealth()` — the pill on the wide bar, or the ⋯ menu at narrow widths (the
 * menu is the only place the pill lives below `lg`). So on a phone `/health`
 * was polled only while that menu happened to be open, and "Pause auto-refresh"
 * did not mean the same thing at every width. This component fixes the
 * ownership: the shell mounts it exactly once, unconditionally, so the poll
 * runs continuously regardless of viewport or which menu is open.
 *
 * **One interval, one observer.** TanStack Query dedupes by `queryKey`, so the
 * pill / dashboard / data read the same cache without a second request — but
 * `refetchInterval` creates a *timer* on whichever observer sets it. Only this
 * observer carries a live interval; the display observers (`healthDisplaySpec`)
 * pin theirs to `false` so they can never start a second loop.
 *
 * `/health` is public and key-free (AGENTS.md non-negotiable #6): the fetch is
 * `HEALTH_URL` (`API_ORIGIN + '/health'`) via `apiGetAbsolute`, which attaches
 * no credential. This observer never triggers an authenticated request.
 */

/** The running cadence — one home for the number so nothing can drift. */
export const HEALTH_POLL_INTERVAL_MS = 30_000

/** TanStack's off value. `false` means "no timer"; `0` would be a runaway loop. */
const NO_INTERVAL = false

/** Everything shared between the poll and the display observers. */
const HEALTH_QUERY_KEY = ['health'] as const

async function healthQueryFn({ signal }: QueryFunctionContext): Promise<Health> {
  return parseOrThrow(
    HealthSchema,
    await apiGetAbsolute<unknown>(HEALTH_URL, { signal }),
    'health',
  )
}

/**
 * The poll's query config — the one place the interval lives.
 *
 * A pure function of the pause flag so a node-env spec can pin that pausing
 * maps to `refetchInterval: false` for the OBSERVER (not just the pill). It
 * reads the store reactively through `useHealthPollPaused`, so the ⋯ menu's
 * checkbox (a different subtree) turning the pause on stops this timer too.
 */
export function healthObserverSpec(paused: boolean): UseQueryOptions<Health> {
  return {
    queryKey: HEALTH_QUERY_KEY,
    queryFn: healthQueryFn,
    staleTime: 15_000,
    refetchInterval: paused ? NO_INTERVAL : HEALTH_POLL_INTERVAL_MS,
    retry: 1,
  }
}

/**
 * A display observer's config: reads the shared `['health']` cache but owns no
 * timer, so the pill / dashboard / data can subscribe freely without starting a
 * second loop.
 */
export function healthDisplaySpec(): UseQueryOptions<Health> {
  return {
    queryKey: HEALTH_QUERY_KEY,
    queryFn: healthQueryFn,
    staleTime: 15_000,
    refetchInterval: NO_INTERVAL,
    retry: 1,
  }
}

/**
 * Mounts the one poll. Renders nothing — it is an observer, not a control.
 * The shell (`AppShell`) mounts it once so the loop is width- and menu-
 * independent; the pause is still driven reactively from the store.
 */
export function HealthObserver() {
  const [paused] = useHealthPollPaused()
  useQuery(healthObserverSpec(paused))
  return null
}
