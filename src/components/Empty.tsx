import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Honest empty state. `hint` should explain *why* it is empty (e.g. "not yet
 * populated by the live API") rather than implying a failure.
 */
export function Empty({
  title = 'Nothing to show',
  hint,
  icon,
  compact = false,
  children,
}: {
  title?: string
  hint?: ReactNode
  icon?: ReactNode
  compact?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        // `bg-muted` rather than a translucent wash: on a white card the
        // translucent version computed to #fcfcfc, so the empty slot was
        // invisible and only the dashed border hinted that anything was there.
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted text-center',
        compact ? 'gap-1 px-3 py-4' : 'gap-2 px-4 py-8',
      )}
    >
      <span className="text-muted-foreground">{icon ?? <Inbox className="size-5" aria-hidden />}</span>
      <p className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>{title}</p>
      {hint && <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}
