import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

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
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700/70 bg-slate-950/40 text-center ${
        compact ? 'gap-1 px-3 py-4' : 'gap-2 px-4 py-8'
      }`}
    >
      <span className="text-slate-600">{icon ?? <Inbox className="size-5" aria-hidden />}</span>
      <p className={`text-slate-300 ${compact ? 'text-xs' : 'text-sm'} font-medium`}>{title}</p>
      {hint && <p className="max-w-prose text-xs leading-relaxed text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}