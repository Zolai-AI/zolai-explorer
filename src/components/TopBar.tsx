import type { ReactNode } from 'react'
import { ShieldCheck, KeyRound } from 'lucide-react'
import { HealthPill } from './HealthPill'
import { useApiKey } from './KeyDialog'
import { ThemeToggle } from './ThemeToggle'
import { CommandPaletteTrigger } from './CommandPalette'
import { Button } from './ui/button'

/**
 * Sticky top bar: brand, live health, theme switch, command palette and the
 * API-key control.
 *
 * Mobile-first — the wordmark label and button labels collapse below `sm`, the
 * icons keep a 40px touch target at every width. The palette trigger is
 * visible at all widths (icon-only below `sm`) so ⌘K is never the only way in.
 */
export function TopBar({
  nav,
  onOpenPalette,
  onOpenApiKey,
}: {
  nav?: ReactNode
  onOpenPalette: () => void
  onOpenApiKey: (reason?: string) => void
}) {
  const { hasKey, masked } = useApiKey()

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

        {/* Hidden below `sm` — the logo and 7 nav items cover navigation there,
            and the width is needed by the health pill and key button. */}
        <CommandPaletteTrigger onOpen={onOpenPalette} />

        <ThemeToggle />

        <Button
          variant="outline"
          onClick={() => onOpenApiKey()}
          className={`max-lg:h-10 ${hasKey ? '' : 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'}`}
          title={hasKey ? `API key set (${masked})` : 'No API key — public endpoints only'}
        >
          {hasKey ? <ShieldCheck aria-hidden /> : <KeyRound aria-hidden />}
          <span className="hidden sm:inline">{hasKey ? 'API key' : 'Set API key'}</span>
        </Button>
      </div>
    </header>
  )
}
