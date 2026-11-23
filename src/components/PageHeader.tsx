import type { JSX, ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * The page's single `<h1>` plus its supporting lines.
 *
 * One component so every route titles itself the same way — the heading face
 * (`cn-font-heading`), one `<h1>` per page, and the actions that belong to the
 * page rather than to a panel.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  meta,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}): JSX.Element {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="cn-font-heading flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          {icon && (
            <span aria-hidden className="text-primary">
              {icon}
            </span>
          )}
          {title}
        </h1>
        {description !== undefined && description !== null ? (
          <p className="mt-1 max-w-prose text-pretty text-sm text-muted-foreground">{description}</p>
        ) : null}
        {meta !== undefined && meta !== null ? (
          <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
