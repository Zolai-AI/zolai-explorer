import type { JSX, ReactNode } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert'
import { cn } from '../lib/utils'

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success'

/**
 * One border / fill / text triple per tone.
 *
 * The amber pair is `amber-800` / `amber-200` and not `700` / `300`: on the
 * tinted fill the darker pair is what keeps body copy above AA contrast, in
 * both themes.
 */
const TONE_CLASSES: Record<NoticeTone, string> = {
  info: 'border-border bg-muted/50 text-foreground',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
}

/**
 * Inline notice, built on the shadcn `<Alert>`.
 *
 * The tone owns the whole box — border, fill and text — so the amber
 * treatment that used to be spelled out in eight different files has exactly
 * one home here. `danger` keeps the primitive's own `role="alert"`; the other
 * tones are announcements, not emergencies, so they speak through
 * `role="status"`.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: NoticeTone
  title?: ReactNode
  children?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}): JSX.Element {
  const liveProps = tone === 'danger' ? {} : { role: 'status' as const }

  return (
    <Alert
      {...liveProps}
      className={cn(TONE_CLASSES[tone], icon && 'grid-cols-[auto_1fr] gap-x-2', className)}
    >
      {icon && (
        // The primitive grid-aligns a *direct* `svg` child; the icon is
        // wrapped, so the grid is set up here and the icon spans both rows.
        <span aria-hidden className="row-span-2 leading-none [&>svg]:block [&>svg]:size-4">
          {icon}
        </span>
      )}
      {title !== undefined && title !== null ? <AlertTitle>{title}</AlertTitle> : null}
      {children !== undefined && children !== null ? (
        // Prose-width cap: a notice body is a sentence, and uncapped it runs
        // the full desktop column as one unreadable line.
        <AlertDescription className="max-w-prose text-current">{children}</AlertDescription>
      ) : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  )
}
