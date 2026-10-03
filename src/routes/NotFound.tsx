import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <Compass className="size-8 text-slate-600" aria-hidden />
      <h1 className="text-lg font-semibold text-slate-100">Route not found</h1>
      <p className="max-w-prose text-sm text-slate-400">
        That path is not part of Zolai Explorer. Use the sidebar, or go back to the dashboard.
      </p>
      <Link
        to="/"
        className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
      >
        Dashboard
      </Link>
    </div>
  )
}