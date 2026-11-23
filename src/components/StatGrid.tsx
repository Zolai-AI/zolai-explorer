import type { JSX, ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Column ladder for the KPI tiles.
 *
 * Written out in full because the class names have to be visible to the
 * Tailwind scanner — a computed `lg:grid-cols-${columns}` is not a class the
 * compiler can see.
 */
const COLUMN_CLASSES: Record<2 | 3 | 4 | 5, string> = {
  2: 'sm:grid-cols-2 lg:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
}

/**
 * Responsive grid for KPI tiles.
 *
 * Two columns on a phone, and the requested count from `lg` — the base layout
 * is the small screen and every step up is additive.
 */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0',
        COLUMN_CLASSES[columns],
        className,
      )}
    >
      {children}
    </div>
  )
}
