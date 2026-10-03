import type { ReactNode } from 'react'

export type CardTone = 'default' | 'muted' | 'accent'

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
  const toneClass =
    tone === 'accent'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : tone === 'muted'
        ? 'border-slate-800 bg-slate-900/40'
        : 'border-slate-800 bg-slate-900/60'

  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border backdrop-blur-sm ${toneClass} ${className}`}
    >
      {(title || actions || subtitle) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-sm font-semibold tracking-tight text-slate-100">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`min-w-0 flex-1 px-4 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  )
}