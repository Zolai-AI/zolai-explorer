import type { JSX, ReactNode } from 'react'
import { cn } from '../lib/utils'

export type MetaItem = { label: string; value: ReactNode }

/**
 * Key/value metadata rows.
 *
 * A missing value renders the em dash the app uses everywhere else for
 * "unknown" — a blank or a zero would read as a real measurement, and the
 * API not returning a field is not the same as the field being zero.
 */
export function MetaList({
  items,
  className,
}: {
  items: MetaItem[]
  className?: string
}): JSX.Element | null {
  if (items.length === 0) return null

  return (
    <dl className={cn('divide-y', className)}>
      {items.map((item) => {
        const unknown = item.value === undefined || item.value === null
        return (
          <div
            key={item.label}
            className="py-1.5 sm:grid sm:grid-cols-[minmax(0,auto)_1fr] sm:gap-x-4"
          >
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                'min-w-0 break-words text-sm',
                unknown ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {unknown ? '—' : item.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
