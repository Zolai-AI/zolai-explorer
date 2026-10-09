import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogIn, ShieldCheck, KeyRound } from 'lucide-react'
import { HealthPill } from './HealthPill'
import { useApiKey } from './KeyDialog'
import { ThemeToggle } from './ThemeToggle'
import { CommandPaletteTrigger } from './CommandPalette'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { roleBadge, useAuthMe } from '../lib/auth'
import { signInPath } from '../lib/routes'
import { signInEntry } from '../lib/signIn'
import { cn } from '../lib/utils'

/**
 * Sticky top bar: brand, live health, theme switch, command palette, the
 * paste-key dialog and the **sign-in control**.
 *
 * Sign-in is a primary action, not a hidden gate prompt: it is the one control
 * that turns a read-only anonymous session into an identified one, so it is
 * always rendered, for every role — "Sign in" in amber while the server reports
 * `anonymous`, the role badge plus the server's key prefix once it does. A
 * signed-in user still gets the same control, because signing *out* has to be
 * reachable too. The destination comes from the route registry (`signInPath`),
 * and the label/tone from the identity the server reported — never from a
 * guessed role.
 *
 * Mobile-first — the wordmark label and button labels collapse below `sm` (and
 * to icon-only width below `lg` for the two key controls), the icons keep a 40px
 * touch target at every width. The palette trigger is visible at all widths
 * (icon-only below `sm`) so ⌘K is never the only way in.
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
  const me = useAuthMe()
  const location = useLocation()
  const entry = signInEntry({ role: me.role, keyPrefix: me.key_prefix })
  const badge = roleBadge(me.role)

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

        {/* Secondary: manage the stored key without leaving the page. */}
        <Button
          variant="outline"
          onClick={() => onOpenApiKey()}
          className={`max-lg:h-10 ${hasKey ? '' : 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'}`}
          title={hasKey ? `API key set (${masked})` : 'No API key — public endpoints only'}
        >
          <KeyRound aria-hidden />
          <span className="hidden sm:inline">{hasKey ? 'API key' : 'Set API key'}</span>
        </Button>

        {/* Primary: sign in (anonymous) or show the identity the server reports.
            Always rendered, for every role, so no state of this app is a dead
            end — and `?from=` returns the user to the panel they came from.
            Labels collapse below `sm`; the role badge and the server's key
            prefix only appear from `lg`, so the bar cannot overflow on a
            640px screen where ⌘K still shows its full-width hint. */}
        <Button
          asChild
          variant="outline"
          className={cn(
            'max-lg:h-10 max-lg:w-10 max-lg:justify-center max-lg:px-0',
            // Amber while anonymous — the same language the no-key state has
            // always used, so "there is no key here" reads at a glance.
            entry.anonymous &&
              'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
          )}
        >
          <Link to={signInPath(location.pathname)} title={entry.title}>
            {entry.anonymous ? (
              // Sign-in, not a key: `KeyRound` stays on the API-key button
              // above, so the two controls never read as the same affordance.
              <LogIn aria-hidden />
            ) : (
              <ShieldCheck aria-hidden className="text-primary" />
            )}
            <span className="hidden sm:inline">{entry.label}</span>
            {!entry.anonymous && (
              <Badge variant={badge.variant} className="hidden lg:inline-flex">
                {badge.label}
              </Badge>
            )}
            {entry.keyPrefix && (
              <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
                {entry.keyPrefix}
              </span>
            )}
            <span className="sr-only sm:hidden">{entry.label}</span>
          </Link>
        </Button>
      </div>
    </header>
  )
}
