import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '../components/ui/button'

export function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <Compass className="size-8 text-muted-foreground/60" aria-hidden />
      <h1 className="text-lg font-semibold">Route not found</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        That path is not part of Zolai Explorer. Use the sidebar, or go back to the dashboard.
      </p>
      <Button asChild className="mt-1 h-10">
        <Link to="/">Dashboard</Link>
      </Button>
    </div>
  )
}
