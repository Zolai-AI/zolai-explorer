import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader } from './ui/card'
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
}: {
  label: string
  value: number | string
  hint?: ReactNode
  icon?: ReactNode
  to?: string
  accent?: boolean
}) {
  const body = (
    <>
      <CardHeader>
        {/* Label and icon share one row — CardHeader itself stacks by default. */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
            accent ? 'text-primary' : 'text-foreground',
          )}
        >
          {typeof value === 'number' ? formatCount(value) : value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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
  value: number | string
  hint?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">
        {typeof value === 'number' ? formatCount(value) : value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
