import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ellipsis, KeyRound, LogIn, LogOut, Monitor, Moon, Search, ShieldCheck, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { HealthPill } from './HealthPill'
import { useApiKey } from './KeyDialog'
import { ThemeToggle } from './ThemeToggle'
import { CommandPaletteTrigger } from './CommandPalette'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { roleBadge, useAuthMe } from '../lib/auth'
import { signInPath } from '../lib/routes'
import { signInEntry, signInFooterEntry } from '../lib/signIn'
import { signOut } from '../lib/session'
import { useThemePreference } from '../lib/useTheme'
import type { Theme } from '../lib/theme'
import { cn } from '../lib/utils'

/** The same three choices `ThemeToggle` names — never a bare light/dark toggle. */
const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

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
 * Mobile-first, in **tiers** — and hiding happens on wrapper spans, never with
 * a display class on a component's internals:
 * - below `sm` the brand is the logo alone (the wordmark collapses) and the
 *   palette/theme/health controls move into the ⋯ overflow menu, leaving only
 *   the icon-only key and sign-in controls inline;
 * - from `sm` the palette trigger and theme toggle come back inline;
 * - from `md` the health pill and the key/sign-in labels join them.
 * Every icon-only control keeps a 40px touch target, and every label that
 * hides keeps an `sr-only` or `title` companion so the accessible name exists
 * at every width.
 *
 * **Sign-out below `lg`**: the persistent `<aside>` is `hidden … lg:block`, so
 * under that breakpoint the sidebar footer — where sign-out had always lived —
 * is inside the hamburger `<Sheet>` and cost two taps to reach. The control is
 * mirrored here, icon-only and only while a credential is active, so an
 * identified user can end their session from any screen in one tap. It is
 * hidden from `lg` up, where the sidebar footer already shows the labelled
 * button, so there is never a duplicate.
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
  // Same derivation as the sidebar footer: `action: 'sign-out'` only when the
  // server reports an identified role.
  const footer = signInFooterEntry({ role: me.role, keyPrefix: me.key_prefix })
  const badge = roleBadge(me.role)
  const { theme, setTheme } = useThemePreference()

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/85 px-3 backdrop-blur sm:gap-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        {nav}
        <img
          src="/logo.png"
          alt="Zolai Explorer"
          className="size-7 shrink-0 rounded-lg object-contain"
        />
        {/* Below `sm` the logo's alt text is the brand — the wordmark would
            squeeze the controls off a 375px bar. */}
        <span className="hidden truncate text-sm font-semibold tracking-tight sm:inline">
          Zolai Explorer
        </span>
        <span className="hidden text-[10px] tracking-wider text-muted-foreground uppercase lg:inline">
          studio
        </span>
      </div>

      {/* `min-w-0 shrink` (not `shrink-0`): with every control pinned to its
          intrinsic width the bar overflowed the viewport by 2px at exactly the
          `sm` breakpoint. The group now yields, the labels inside it ellipsize,
          and the controls that must not squash keep their own `shrink-0`. */}
      <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
        {/* Below `md` the pill lives in the ⋯ overflow menu — wrapper span, so
            `HealthPill`'s own markup stays breakpoint-free. */}
        <span className="hidden md:block">
          <HealthPill />
        </span>

        {/* Below `sm` the palette opens from the ⋯ overflow menu; the trigger
            must not be the only way in, and it must not be the only thing on a
            phone bar either. */}
        <span className="hidden sm:block">
          <CommandPaletteTrigger onOpen={onOpenPalette} />
        </span>

        {/* Below `sm` the theme radio group is in the ⋯ overflow menu. */}
        <span className="hidden sm:block">
          <ThemeToggle />
        </span>

        {/* Below `sm`: one tap to the palette, the theme choices and the
            health pill, so nothing the wider bar carries becomes unreachable. */}
        <span className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                // 40px minimum touch target, like every other compact control.
                className="max-lg:size-10"
                aria-label="More options"
                title="More options"
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onOpenPalette} className="max-lg:min-h-10">
                <Search aria-hidden />
                Search commands…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as Theme)}
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuRadioItem key={value} value={value} className="max-lg:min-h-10">
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <HealthPill />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>

        {/* Secondary: manage the stored key without leaving the page. Icon-only
            below `md`; the label returns there, with `title` covering the
            accessible name at every width. */}
        <Button
          variant="outline"
          onClick={() => onOpenApiKey()}
          className={`max-lg:h-10 shrink-0 ${hasKey ? '' : 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'}`}
          title={hasKey ? `API key set (${masked})` : 'No API key — public endpoints only'}
        >
          <KeyRound aria-hidden />
          <span className="hidden md:inline">{hasKey ? 'API key' : 'Set API key'}</span>
        </Button>

        {/* Primary: sign in (anonymous) or show the identity the server reports.
            Always rendered, for every role, so no state of this app is a dead
            end — and `?from=` returns the user to the panel they came from.
            Labels collapse below `md`; the role badge and the server's key
            prefix only appear from `lg`, so the bar cannot overflow on a
            640px screen where ⌘K still shows its full-width hint. */}
        <Button
          asChild
          variant="outline"
          className={cn(
            'max-lg:h-10 max-md:w-10 max-md:justify-center max-md:px-0 min-w-0',
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
            <span className="hidden truncate md:inline">{entry.label}</span>
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
            {/* Accessible name below `md`, where the label itself is hidden. */}
            <span className="sr-only md:hidden">{entry.label}</span>
          </Link>
        </Button>

        {/* Sign-out, below `lg` only, and only when there is something to end.
            Mirrors the sidebar footer so the drawer is not the sole route to
            dropping a session. `signInFooterEntry` is the same source of truth
            the sidebar uses, so label/title/behaviour cannot drift apart. */}
        {!entry.anonymous && (
          <Button
            variant="ghost"
            className="max-lg:h-10 max-lg:w-10 max-lg:justify-center max-lg:px-0 shrink-0 lg:hidden"
            title={footer.title}
            aria-label={footer.label}
            onClick={() => {
              void signOut().then((result) => {
                toast.info(
                  result.kind === 'session'
                    ? `Signed out — the session for ${result.username ?? 'this account'} is gone.`
                    : 'Signed out — the stored API key is gone.',
                )
              })
            }}
          >
            <LogOut aria-hidden />
          </Button>
        )}
      </div>
    </header>
  )
}
