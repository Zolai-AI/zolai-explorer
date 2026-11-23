import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import { formatCount } from '../lib/format'
import { cn } from '../lib/utils'

/**
 * Dashboard / Data-page stat tile — a shadcn `<Card>`.
 *
 * When `to` is set the whole tile is a router link, so the card is wrapped in a
 * `<Link>` rather than nesting an anchor inside the card body (nested
 * interactive elements are an accessibility problem).
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  to,
  accent = false,
  early = false,
}: {
  label: string
  /** `null`/`undefined` means *unknown*, and renders as `—` — never as 0. */
  value: number | string | null | undefined
  hint?: ReactNode
  icon?: ReactNode
  to?: string
  accent?: boolean
  /** Issue #8: a populated-but-near-empty collection says "early-stage"
   * instead of letting a lone `2` read like a finished dataset. */
  early?: boolean
}) {
  const unknown = value === null || value === undefined
  const body = (
    <>
      <CardHeader>
        {/* Label and icon share one row — CardHeader itself stacks by default. */}
        <div className="flex items-start justify-between gap-2">
          {/* 10px, not 12px: an uppercase tracked label at `text-xs` is ~83px
              wide, and a four-up metric row on a 1024px screen gives it 77px —
              "Confidence" and "Documents" clipped mid-word. `break-words` is the
              safety valve for any longer label: wrap, never clip. */}
          <p className="min-w-0 break-words text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {icon && (
            <span className={accent ? 'text-primary' : 'text-muted-foreground/70'}>{icon}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            unknown ? 'text-muted-foreground' : accent ? 'text-primary' : 'text-foreground',
          )}
        >
          {unknown ? '—' : typeof value === 'number' ? formatCount(value) : value}
        </p>
        {early && !unknown && typeof value === 'number' && (
          <Badge variant="outline" className="mt-1.5 text-[10px] uppercase tracking-wide">
            early-stage
          </Badge>
        )}
        {hint && <p className="mt-1 text-xs break-words text-muted-foreground">{hint}</p>}
      </CardContent>
    </>
  )

  const className = cn(
    'transition',
    accent ? 'border-primary/25 bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/60',
  )

  if (to) {
    return (
      <Link to={to} className={cn('block rounded-xl', className)}>
        <Card className={className}>{body}</Card>
      </Link>
    )
  }
  return <Card className={className}>{body}</Card>
}

/**
 * Compact single-number badge used inside cards.
 *
 * Renders the **exact** count, not a compact abbreviation: a word frequency of
 * 5.2K is useless for corpus work, and these values are all small enough to
 * read in full — no compact abbreviation, so corpus counts stay auditable.
 */
export function Metric({
  label,
  value,
  hint,
}: {
  label: string
  /** `null`/`undefined` means *unknown*, and renders as `—` — never as 0. */
  value: number | string | null | undefined
  hint?: string
}) {
  const unknown = value === null || value === undefined
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="min-w-0 break-words text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          unknown ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {unknown ? '—' : typeof value === 'number' ? formatCount(value) : value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
