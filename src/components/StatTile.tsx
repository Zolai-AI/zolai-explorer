import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatCompact, formatCount } from '../lib/format'

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
  const numeric = typeof value === 'number'
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
        {icon && <span className={accent ? 'text-emerald-400' : 'text-slate-600'}>{icon}</span>}
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${
          accent ? 'text-emerald-300' : 'text-slate-50'
        }`}
      >
        {numeric ? formatCount(value) : value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  )

  const className = `block rounded-xl border p-4 transition ${
    accent
      ? 'border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10'
      : 'border-slate-800 bg-slate-900/60 hover:bg-slate-900'
  }`

  if (to) {
    return (
      <Link to={to} className={`${className} focus-visible:ring-2`}>
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}

/** Compact single-number badge used inside cards. */
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
    <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100 tabular-nums">
        {typeof value === 'number' ? formatCompact(value) : value}
      </p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}