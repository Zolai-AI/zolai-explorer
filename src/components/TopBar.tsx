import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ellipsis, KeyRound, LogIn, LogOut, Monitor, Moon, Pause, Search, ShieldCheck, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { HealthPill } from './HealthPill'
import { useApiKey } from './KeyDialog'
import { ThemeToggle } from './ThemeToggle'
import { CommandPaletteTrigger } from './CommandPalette'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { roleBadge, useAuthMe } from '../lib/auth'
import { useHealthPollPaused } from '../lib/healthPoll'
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
 * a display class on a component's internals. The tiers are **container**
 * queries, not viewport breakpoints (`@container` is set on the content column
 * in `AppShell.tsx`), because the width this bar actually has is not the width
 * the browser reports:
 * - below **480px** of bar: the brand is the logo alone and the palette, theme
 *   and health controls live in the ⋯ overflow menu, leaving only the icon-only
 *   key, sign-in and sign-out controls inline;
 * - from **480px**: the theme toggle comes back inline;
 * - from **820px**: the palette trigger and the key/sign-in labels join them;
 * - from **1020px**: the health pill and the identity's role badge + key prefix
 *   come back, and the ⋯ menu retires (everything it carried is inline).
 * Every icon-only control keeps a 40px touch target, and every label that hides
 * keeps an `sr-only` companion so the accessible name exists at every width.
 *
 * **Sign-out below `lg`**: the persistent `<aside>` is `hidden … lg:block`, so
 * under that breakpoint the sidebar footer — where sign-out had always lived —
 * is inside the hamburger `<Sheet>` and cost two taps to reach. The control is
 * mirrored here, icon-only and only while a credential is active, so an
 * identified user can end their session from any screen in one tap. It is
 * hidden from `lg` up, where the sidebar footer already shows the labelled
 * button, so there is never a duplicate. (This one stays viewport-keyed on
 * purpose: what it mirrors is the `<aside>`, which appears at the `lg`
 * *viewport* breakpoint.)
 *
 * **Why the tiers stopped being breakpoints** (`docs/OPEN-ISSUES.md` #12): the
 * cluster's children are fixed widths — 40px icon targets that may not shrink
 * (the 40px floor is this repo's rule) plus the trigger's `sm:w-44` — so
 * `min-w-0 shrink` bottoms out at their sum and the *header* drives a page-level
 * horizontal scrollbar. Measured in Chrome on `/data`, `/review`, `/word/pasian`:
 *
 *   | viewport | layout box | sidebar | header needed | overflow |
 *   |---------:|-----------:|--------:|--------------:|---------:|
 *   |      768 |        753 |       — |           779 |     **3px** |
 *   |     1024 |       1009 |     239 |           916 |    **38px** |
 *   |     1280 |       1265 |     239 |           916 |         0 |
 *
 * Both failures are the *same* one: a media query fires at the viewport width,
 * which includes the 15px scrollbar gutter — and at `lg`, worse, the width the
 * query sees (1024) is the width *before* the sidebar that appears at the same
 * breakpoint takes its 239px. So the row was asked to hold a tier it did not
 * have. Naming the thresholds by measured need (449 / 779 / 916, rounded up with
 * slack) and asking the container instead of the viewport is what closes both
 * bands; a `sm`/`md`/`lg` ladder cannot, because the two columns of that table
 * are not functions of the viewport.
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
  const { hasKey } = useApiKey()
  const me = useAuthMe()
  const location = useLocation()
  const entry = signInEntry({ role: me.role, keyPrefix: me.key_prefix })
  // Same derivation as the sidebar footer: `action: 'sign-out'` only when the
  // server reports an identified role.
  const footer = signInFooterEntry({ role: me.role, keyPrefix: me.key_prefix, authSource: me.auth_source })
  const badge = roleBadge(me.role)
  // A session is a credential too. The key control went amber and warned
  // "public endpoints only" on the absence of a *stored key* alone, which told a
  // tab signed in with an account that it could not reach the gated endpoints it
  // was already reading. `auth_source` is the server's own word for which
  // credential won.
  const sessionActive = me.auth_source === 'session'
  const { theme, setTheme } = useThemePreference()
  // The menu owns the pause, and it must read the store as it is *now* — a
  // toggle that opens showing the wrong state is worse than no toggle.
  const [pollPaused, setPollPaused] = useHealthPollPaused()

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
        <span className="hidden text-xs tracking-wider text-muted-foreground uppercase lg:inline">
          studio
        </span>
      </div>

      {/* `min-w-0 shrink` (not `shrink-0`): with every control pinned to its
          intrinsic width the bar overflowed the viewport by 2px at exactly the
          `sm` breakpoint. The group now yields, the labels inside it ellipsize,
          and the controls that must not squash keep their own `shrink-0`.
          Yielding has a floor, though — the sum of those fixed widths — which is
          why the widest of them left the inline row below `md` (#12). */}
      <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
        {/* From the 1020px tier the pill sits inline. Below it the pill lives in
            the ⋯ overflow menu instead: its longest label ("unreachable", 11
            chars in `whitespace-nowrap` mono) cannot shrink, and an inline
            health pill is what pushed the bar past its box at viewport 1024,
            where the sidebar that appears at the same breakpoint had already
            taken 239px — the one state where the studio most needs to stay
            usable. */}
        <span className="hidden min-w-0 @min-[1020px]:block">
          <HealthPill />
        </span>

        {/* Below the 820px tier the palette opens from the ⋯ overflow menu; the
            trigger must not be the only way in, and it must not be the only
            thing on a phone bar either. It is a fixed `sm:w-44` that cannot
            shrink, so it joins the inline row when the *bar* has room for it
            (measured need 779px), not when the viewport crosses `md` — at a 768
            window the bar is 753 and the row overflowed by 3px (#12). */}
        <span className="hidden @min-[820px]:block">
          <CommandPaletteTrigger onOpen={onOpenPalette} />
        </span>

        {/* Below the 480px tier the theme radio group is in the ⋯ overflow menu. */}
        <span className="hidden @min-[480px]:block">
          <ThemeToggle />
        </span>

        {/* While any tier is missing, the ⋯ menu is its home: one tap to the
            palette, the theme choices, the health poll's pause and the pill
            itself, so nothing the wider bar carries becomes unreachable. It
            retires exactly where the last tier comes back, so the palette is
            never stranded between the two. */}
        <span className="@min-[1020px]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                // 40px minimum touch target, like every other compact control.
                className="max-lg:size-10"
                aria-label="More options"
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
              {/* Stops the 30s `/health` loop. A checkbox, not an action item:
                  the state has to be readable on open, not inferred from
                  whether the bar happens to be ticking. */}
              <DropdownMenuCheckboxItem
                checked={pollPaused}
                onCheckedChange={(value) => setPollPaused(value)}
                className="max-lg:min-h-10"
              >
                <Pause className="size-4" aria-hidden />
                Pause auto-refresh
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <HealthPill />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>

        {/* Secondary: manage the stored key without leaving the page. Icon-only
            below the 820px tier, where an `sr-only` companion carries the
            accessible name (the same pattern as sign-in). What credential this
            tab actually sends is not tooltip material: it is on screen in the
            identity control beside it, in the `AuthBanner` when it changes what
            you can reach, and in the dialog this button opens. */}
        <Button
          variant="outline"
          onClick={() => onOpenApiKey()}
          className={cn(
            'max-lg:h-10 shrink-0',
            !hasKey &&
              !sessionActive &&
              'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
          )}
        >
          <KeyRound aria-hidden />
          <span className="hidden @min-[820px]:inline">{hasKey ? 'API key' : 'Set API key'}</span>
          {/* Accessible name below the tier, where the label itself is hidden.
              The masked prefix travels with the identity control beside this
              one, so it is not repeated here — a wider label would push this
              tier past the width it was measured at. */}
          <span className="sr-only @min-[820px]:hidden">
            {hasKey ? 'API key' : 'No API key stored — set one'}
          </span>
        </Button>

        {/* Primary: sign in (anonymous) or show the identity the server reports.
            Always rendered, for every role, so no state of this app is a dead
            end — and `?from=` returns the user to the panel they came from.
            The label collapses below the 820px tier and the role badge with the
            server's key prefix appear only from the 1020px tier, which is the
            same tier that retires the ⋯ menu and brings the pill back: the three
            are revealed together because they are measured together (916px of
            bar), and none of them survives on the viewport's `lg` alone. The
            identity is what you are looking at, not tooltip-only content. */}
        <Button
          asChild
          variant="outline"
          className={cn(
            'max-lg:h-10 @max-[820px]:w-10 @max-[820px]:justify-center @max-[820px]:px-0 min-w-0',
            // Amber while anonymous — the same language the no-key state has
            // always used, so "there is no key here" reads at a glance.
            entry.anonymous &&
              'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
          )}
        >
          <Link to={signInPath(location.pathname)}>
            {entry.anonymous ? (
              // Sign-in, not a key: `KeyRound` stays on the API-key button
              // above, so the two controls never read as the same affordance.
              <LogIn aria-hidden />
            ) : (
              <ShieldCheck aria-hidden className="text-primary" />
            )}
            <span className="hidden min-w-0 truncate @min-[820px]:inline">{entry.label}</span>
            {!entry.anonymous && (
              <Badge variant={badge.variant} className="hidden @min-[1020px]:inline-flex">
                {badge.label}
              </Badge>
            )}
            {entry.keyPrefix && (
              <span className="hidden font-mono text-xs text-muted-foreground @min-[1020px]:inline">
                {entry.keyPrefix}
              </span>
            )}
            {/* Accessible name below the tier, where the label itself is hidden. */}
            <span className="sr-only @min-[820px]:hidden">{entry.label}</span>
          </Link>
        </Button>

        {/* Sign-out, below `lg` only, and only when there is something to end.
            Mirrors the sidebar footer so the drawer is not the sole route to
            dropping a session. `signInFooterEntry` is the same source of truth
            the sidebar uses, so label/behaviour cannot drift apart. What ending
            the session does is said by the toast the click produces, not by a
            hover tooltip. */}
        {!entry.anonymous && (
          <Button
            variant="ghost"
            className="max-lg:h-10 max-lg:w-10 max-lg:justify-center max-lg:px-0 shrink-0 lg:hidden"
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
