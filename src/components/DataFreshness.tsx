import { useEffect, useState, type JSX } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { formatTimestamp } from '../lib/format'
import { cn } from '../lib/utils'

/**
 * Re-render cadence for the relative label. Thirty seconds is fine-grained
 * against a "4 min ago" reading and cheap (one state bump per visible panel).
 */
const TICK_MS = 30_000

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Relative "… ago" phrase for a receive timestamp, or `null` when there is no
 * honest time to state.
 *
 * Pure and exported for the node-env test suite (this repo runs vitest without
 * a DOM). `updatedAtMs` is *this browser's* receive time — TanStack Query's
 * `dataUpdatedAt` — never a server claim; `null`/`0`/non-finite means "this
 * browser has not received a payload", and a future value (clock skew) is
 * floored to `just now` so the label can never read as a negative age.
 */
export function relativeFetched(
  updatedAtMs: number | null | undefined,
  nowMs: number,
): string | null {
  if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
    return null
  }
  const elapsed = nowMs - updatedAtMs
  if (elapsed < MINUTE_MS) return 'just now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} hr ago`
  const days = Math.floor(elapsed / DAY_MS)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * The full short sentence for a payload's currency, split from `fetched` so
 * callers never re-spell the copy.
 *
 * The word choice is fixed by the repo's honesty rules: "fetched" — this
 * browser's receive time — never "updated"/"synced"/"current", which would
 * imply knowledge of the server or the corpus.
 */
export function freshnessCopy(
  updatedAtMs: number | null | undefined,
  nowMs: number,
): { fetched: boolean; text: string } {
  const relative = relativeFetched(updatedAtMs, nowMs)
  if (relative === null) return { fetched: false, text: 'not fetched yet' }
  return { fetched: true, text: `fetched ${relative}` }
}

/**
 * "fetched 4 min ago · 2026-10-29 14:30 UTC · Refresh" — data currency for one
 * governing query.
 *
 * Dashboards must state how current the numbers on screen are (NN/g,
 * thedan.design). One rule drives this whole component: the timestamp is
 * *this browser's receive time* (`query.dataUpdatedAt`), so the copy says
 * "fetched" and nothing about the server or the corpus.
 *
 * Relative-vs-absolute (the repo's no-silent-staleness rule): the label is
 * relative and re-rendered on an interval this component owns (`setInterval`
 * cleared on unmount and whenever the time becomes invalid), so "4 min ago"
 * never sits frozen on an open page. The absolute UTC timestamp — which cannot
 * go stale — is rendered as **visible text inside a real `<time dateTime>`
 * element**, never in a hover channel: a native `title` is unreachable by
 * keyboard and touch and is neither persistent nor dismissible (WCAG 1.4.13),
 * and `<time>` also makes the value machine-readable. Room was checked at the
 * three call sites — `routes/Dashboard.tsx`, `routes/Data.tsx` and
 * `routes/Word.tsx` all render this in a `PageHeader`/header meta slot, a
 * wrapping `<p className="… text-xs text-muted-foreground">` that spans the
 * column — and this root is `inline-flex flex-wrap`, so the extra
 * `· 2026-10-29 14:30 UTC` chunk moves onto its own line at 375px instead of
 * overflowing it. It therefore inherits the slot's muted colour rather than
 * adding an alpha step (already-muted text dimmed again risks the contrast
 * budget), and `tabular-nums` keeps the digits from jittering. The interval
 * only runs while a real receive time exists.
 *
 * Renders inline (it lives inside `PageHeader`'s `<p>` meta slot).
 */
export function DataFreshness({
  updatedAtMs,
  isFetching,
  onRefresh,
  subject,
  className,
}: {
  /** `query.dataUpdatedAt` — 0 when this browser has never received data. */
  updatedAtMs: number | null | undefined
  /** `query.isFetching` — in-flight refetch, not just first load. */
  isFetching: boolean
  onRefresh: () => void
  /** Scopes the claim when a page shows several payloads, e.g. "entry". */
  subject?: string
  className?: string
}): JSX.Element {
  // State bump purely to re-evaluate the relative label every TICK_MS while a
  // real time exists; without data there is nothing going stale.
  const [, setTick] = useState(0)
  const hasTime =
    typeof updatedAtMs === 'number' && Number.isFinite(updatedAtMs) && updatedAtMs > 0

  useEffect(() => {
    if (!hasTime) return
    const id = window.setInterval(() => setTick((tick) => tick + 1), TICK_MS)
    return () => window.clearInterval(id)
  }, [hasTime])

  const { fetched, text } = freshnessCopy(updatedAtMs, Date.now())
  // `relativeFetched` accepts any finite positive number, but a value outside
  // the Date range (±8.64e15 ms) makes `toISOString()` throw. `dataUpdatedAt`
  // comes from `Date.now()` so it cannot get there on its own — the guard is
  // here because the prop is typed `number`, not because the caller is trusted.
  const received = fetched && typeof updatedAtMs === 'number' ? new Date(updatedAtMs) : null
  const receivedIso =
    received !== null && !Number.isNaN(received.getTime()) ? received.toISOString() : null

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-1', className)}>
      {fetched && receivedIso !== null ? (
        <>
          <span>{subject ? `${subject} ${text}` : text}</span>
          <span aria-hidden>·</span>
          {/* The absolute receive time, visible — see the header comment. This
              browser's clock and nothing else: no claim about the server. */}
          <time dateTime={receivedIso} className="tabular-nums">
            {formatTimestamp(receivedIso)}
          </time>
        </>
      ) : (
        // Absent state, stated plainly and visually distinct (italic) from a
        // real time — never "fetched 0 min ago" or a fabricated timestamp.
        <span className="text-muted-foreground italic">
          {subject ? `${subject} ` : ''}
          {text}
        </span>
      )}
      {/* The separator travels with the button: left as a sibling it stranded
          at the end of a wrapped line, pointing at nothing. */}
      <span className="inline-flex items-center gap-x-1.5">
        <span aria-hidden>·</span>
        {/* Reflect in-flight state: disabled + "Fetching…" while the query is
            actually running, so the action never looks idle-enabled. */}
        <Button
          variant="link"
          size="xs"
          className="h-auto max-lg:h-10 px-0"
          onClick={onRefresh}
          disabled={isFetching}
        >
          <RefreshCw aria-hidden className={isFetching ? 'animate-spin' : undefined} />
          {isFetching ? 'Fetching…' : 'Refresh'}
        </Button>
      </span>
    </span>
  )
}
