import type { ComponentProps } from 'react'
import { Skeleton as ShadcnSkeleton } from './ui/skeleton'
import { Card, CardContent, CardHeader } from './ui/card'

/** Generic loading skeleton. */
export function Skeleton({ className = '', ...props }: ComponentProps<typeof ShadcnSkeleton>) {
  return <ShadcnSkeleton className={className} {...props} />
}

/** Card-shaped skeleton used while a panel is fetching. */
export function SkeletonCard({ lines = 3, title = true }: { lines?: number; title?: boolean }) {
  return (
    <Card aria-busy="true" className="w-full">
      {title && (
        <CardHeader>
          <ShadcnSkeleton className="h-3.5 w-32" />
        </CardHeader>
      )}
      <CardContent className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <ShadcnSkeleton key={i} className="h-3" style={{ width: `${92 - i * 11}%` }} />
        ))}
        <span className="sr-only">Loading…</span>
      </CardContent>
    </Card>
  )
}

/** Stat-tile skeleton. */
export function SkeletonTile() {
  return (
    <Card aria-busy="true" className="w-full">
      <CardHeader>
        <ShadcnSkeleton className="h-3 w-20" />
      </CardHeader>
      <CardContent className="space-y-2">
        <ShadcnSkeleton className="h-7 w-24" />
        <ShadcnSkeleton className="h-2.5 w-16" />
        <span className="sr-only">Loading…</span>
      </CardContent>
    </Card>
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
