import { useState, type ReactNode } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { HealthPill } from './HealthPill'
import { KeyDialog, useApiKey } from './KeyDialog'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/button'

/**
 * Sticky top bar: brand, live health, theme switch and the API-key control.
 *
 * Mobile-first — the wordmark label and button labels collapse below `sm`, the
 * icons keep a 40px touch target at every width.
 */
export function TopBar({ nav }: { nav?: ReactNode }) {
  const { hasKey, masked } = useApiKey()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState<string | undefined>(undefined)

  const openDialog = (why?: string) => {
    setReason(why)
    setDialogOpen(true)
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/85 px-3 backdrop-blur sm:gap-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        {nav}
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/30"
        >
          Z
        </span>
        <span className="truncate text-sm font-semibold tracking-tight">Zolai Explorer</span>
        <span className="hidden text-[10px] tracking-wider text-muted-foreground uppercase lg:inline">
          studio
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <HealthPill />

        <ThemeToggle />

        <Button
          variant="outline"
          onClick={() => openDialog()}
          className={`max-lg:h-10 ${hasKey ? '' : 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'}`}
          title={hasKey ? `API key set (${masked})` : 'No API key — public endpoints only'}
        >
          {hasKey ? <ShieldCheck aria-hidden /> : <KeyRound aria-hidden />}
          <span className="hidden sm:inline">{hasKey ? 'API key' : 'Set API key'}</span>
        </Button>

        <KeyDialog open={dialogOpen} reason={reason} onClose={() => setDialogOpen(false)} />
      </div>
    </header>
  )
}
