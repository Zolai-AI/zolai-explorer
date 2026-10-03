function barClass(width: string) {
  return `animate-pulse-soft rounded bg-slate-800 ${width}`
}

/** Generic loading skeleton. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse-soft rounded bg-slate-800 ${className}`} aria-hidden />
}

/** Card-shaped skeleton used while a panel is fetching. */
export function SkeletonCard({ lines = 3, title = true }: { lines?: number; title?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-busy="true">
      {title && <div className={barClass('mb-4 h-3.5 w-32')} />}
      <div className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={barClass('h-3')}
            style={{ width: `${92 - i * 11}%` }}
          />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/** Stat-tile skeleton. */
export function SkeletonTile() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-busy="true">
      <div className={barClass('mb-3 h-3 w-20')} />
      <div className={barClass('mb-2 h-7 w-24')} />
      <div className={barClass('h-2.5 w-16')} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/** Row-of-tiles skeleton used on the dashboard. */
export function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonTile key={i} />
      ))}
    </div>
  )
}