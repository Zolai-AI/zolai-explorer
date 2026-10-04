import type { ReactNode } from 'react'
import {
  Card as ShadcnCard,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card'
import { cn } from '../lib/utils'

export type CardTone = 'default' | 'muted' | 'accent'

/**
 * Every panel in the app is a shadcn `<Card>`.
 *
 * The `title` / `subtitle` / `actions` shorthand is kept because all eight
 * routes use it, but the markup underneath is `CardHeader` / `CardTitle` /
 * `CardDescription` / `CardAction` / `CardContent` — compose with those directly
 * when a panel needs a bespoke header (see `CardFooter`).
 */
export function Card({
  title,
  subtitle,
  actions,
  children,
  tone = 'default',
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  tone?: CardTone
  className?: string
  bodyClassName?: string
}) {
  return (
    <ShadcnCard
      className={cn(
        'min-w-0',
        tone === 'accent' && 'border-primary/30 bg-primary/5',
        tone === 'muted' && 'bg-muted/40',
        className,
      )}
    >
      {(title || actions || subtitle) && (
        <CardHeader className="border-b">
          <div className="min-w-0">
            {title && <CardTitle className="truncate">{title}</CardTitle>}
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </div>
          {actions && <CardAction>{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn('min-w-0', bodyClassName)}>{children}</CardContent>
    </ShadcnCard>
  )
}

export {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'
