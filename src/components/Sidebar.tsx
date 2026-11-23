import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  Bot,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  MessageSquareQuote,
  Network,
  ScanText,
  Search,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from './ui/badge'
import { Button, buttonVariants } from './ui/button'
import { Separator } from './ui/separator'
import { can, useAuthMe, useRole, type Role } from '../lib/auth'
import { NAV_ROUTES, DASHBOARD_PATH, specOf, type RouteIconName } from '../lib/routes'
import { signInFooterEntry, signInSurfaces, type SignInFooterEntry } from '../lib/signIn'
import { signOut } from '../lib/session'
import { cn } from '../lib/utils'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  description: string
  /** Minimum server-side role; items below it are filtered out entirely. */
  minRole?: Role
}

/**
 * Icon map for the registry. `Record<RouteIconName, LucideIcon>` means adding a
 * route with a new icon is a compile error until the icon exists here — the
 * registry can never point at a missing glyph.
 */
const NAV_ICONS: Record<RouteIconName, LucideIcon> = {
  gauge: Gauge,
  book: BookOpen,
  scan: ScanText,
  search: Search,
  message: MessageSquareQuote,
  bot: Bot,
  network: Network,
  database: Database,
  link: Link2,
  settings: Settings2,
  key: KeyRound,
  'file-text': FileText,
  'shield-check': ShieldCheck,
}

/**
 * Primary navigation, derived from the route registry in `src/lib/routes.ts` —
 * the same records the router, the palette and the role gate read. It used to be
 * a hand-typed list here, which is how the sidebar and the router drifted apart.
 */
export const NAV_ITEMS: NavItem[] = NAV_ROUTES.map((route) => ({
  to: route.path,
  label: route.label,
  icon: NAV_ICONS[route.icon],
  description: route.description,
  minRole: route.minRole,
}))

/**
 * The footer's non-hover consequence line — what pressing the control does.
 *
 * The two `title={signIn.title}` tooltips this replaced are banned for
 * recoverable content (WCAG 1.4.13: hover-only content is not persistent, not
 * dismissible, and out of reach for keyboard and touch), so the sentence has to
 * be rendered. Half of it is on screen already though: the badge prints
 * `entry.roleLabel` and `entry.keyPrefix`, and `signInFooterEntry` composes the
 * identified `title` from those same two fields — "Signed in as <role>
 * (<prefix>). " plus one consequence sentence (src/lib/signIn.ts:187, the
 * sentence being `signOutConsequence` at :201-205, keyed on the `auth_source`
 * the **server** reported). So the clause is rebuilt from the same two fields
 * and dropped, never guessed at: if that copy ever stops matching, the whole
 * `title` comes back instead of a truncated fragment. While anonymous there is
 * no such clause to strip (`roleLabel: null`, src/lib/signIn.ts:170-178) and the
 * title is one consequence sentence already, so it renders whole.
 *
 * Pure and exported so the strip is assertable in the node environment, where
 * the identity query has no server to answer it.
 */
export function signInFooterNotice(entry: SignInFooterEntry): string {
  const signedInClause = entry.roleLabel
    ? `Signed in as ${entry.roleLabel.toLowerCase()}${entry.keyPrefix ? ` (${entry.keyPrefix})` : ''}. `
    : ''
  return signedInClause !== '' && entry.title.startsWith(signedInClause)
    ? entry.title.slice(signedInClause.length)
    : entry.title
}

/**
 * Primary navigation, filtered by the role the server reports.
 *
 * Each item is a router `<NavLink>` carrying the same `buttonVariants`
 * classes the shell's buttons use, so the row **is** the link: one focusable
 * element (no `<button>` nested inside an `<a>`), middle-click and
 * open-in-new-tab work, and assistive tech announces a link — not a button
 * that happens to navigate. The active state is the NavLink's own
 * `aria-current="page"`, applied through the `className` callback, so there
 * is no second mechanism to drift.
 *
 * `onNavigate` lets the mobile `<Sheet>` close itself after a tap.
 *
 * The footer carries the sign-in entry — a link to the registry's sign-in page
 * while anonymous, the role badge plus **Sign out** once the server recognises a
 * key — for every role and at both widths. It is the one control that must not
 * be role-filtered: hiding it from an identified user strands the session, and
 * hiding it from an anonymous one recreates the chicken-and-egg trap the
 * `nav: false` record exists to avoid.
 *
 * `collapsed` is the `lg+` icon-rail mode. It is **never** applied below `lg` —
 * the caller only sets it for the persistent `<aside>`, and the `<Sheet>`
 * drawer always renders the full-width labelled list.
 */
export function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const role = useRole()
  // The identity payload, not just the rank: the sign-in footer shows the role
  // badge and the server's key prefix, both straight from `/auth/me`.
  const me = useAuthMe()
  const items = NAV_ITEMS.filter((item) => can(role, item.minRole ?? 'anonymous'))
  // Registry-derived, and deliberately **not** role-filtered: sign-in is offered
  // to anonymous users, and an identified user needs the sign-out half of it.
  const signIn = signInFooterEntry({ role: me.role, keyPrefix: me.key_prefix, authSource: me.auth_source })
  const showSignIn = signInSurfaces(specOf('login')).sidebar
  // The consequence sentence the footer tooltip used to carry, minus the half
  // the badge already prints — see `signInFooterNotice`.
  const signInNotice = signInFooterNotice(signIn)

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'scrollbar-thin flex h-full w-full flex-col gap-1 overflow-y-auto p-3',
        collapsed && 'items-center px-1.5',
      )}
    >
      <ul className={cn('flex flex-col gap-1', collapsed && 'w-full')}>
        {items.map(({ to, label, icon: Icon, description }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === DASHBOARD_PATH}
              onClick={onNavigate}
              // Icon-only mode: the label is hidden visually, so the anchor
              // itself carries it as the accessible name.
              aria-label={collapsed ? label : undefined}
              // `data-slot` keeps the row classed as a button-weight control
              // (it is 44px tall on mobile either way); everything else about
              // it is plain link semantics.
              data-slot="button"
              className={({ isActive }) =>
                cn(
                  buttonVariants({
                    variant: 'ghost',
                    className: cn(
                      'max-lg:h-11 w-full justify-start gap-2.5 px-2.5',
                      collapsed && 'justify-center gap-0 px-0',
                      !isActive && 'text-muted-foreground',
                    ),
                  }),
                  isActive &&
                    'bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/15',
                )
              }
            >
              <Icon className="size-4.5 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
              {/* The row's `title={description}` is gone (WCAG 1.4.13 — a native
                  tooltip is hover-only, not dismissible, unreachable by
                  keyboard and touch). Where the registry description is already
                  visible: the mobile drawer header prints the **active** one
                  (`AppShell.tsx:146` reads `active?.description`); the ⌘K row
                  shows the label plus the **path** as its shortcut
                  (`CommandPalette.tsx:219,225` with `hint: route.path` at
                  `commands.ts:67`), and an opened page titles itself with its
                  own prose (`Agent.tsx:165`), not this string. So on the desktop
                  rail the description had no visible home and none for
                  assistive tech either — it is now an `sr-only` continuation of
                  the link's accessible name rather than a second line, because
                  at `w-60` (`AppShell.tsx:98`) the longest ones ("Submit new
                  words, meanings, usage examples, and corrections") would simply
                  truncate. Not rendered in the icon rail: it is `w-16`, and the
                  `aria-label` above already decides the name, so a second span
                  would be inert markup. */}
              {!collapsed && <span className="sr-only">{` — ${description}`}</span>}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={cn('mt-auto space-y-2 pt-3', collapsed && 'w-full')}>
        <Separator />

        {/* Sign-in footer — always present, for every role. Registry-derived
            (`specOf('login')` + `signInFooterEntry`), never a role-gated nav
            item, because the person who most needs to find it is the one who
            cannot pass a gate yet. */}
        {showSignIn && (
          <>
            {signIn.action === 'sign-in' && signIn.to ? (
              <NavLink
                to={signIn.to}
                onClick={onNavigate}
                aria-label={collapsed ? signIn.label : undefined}
                data-slot="button"
                className={({ isActive }) =>
                  cn(
                    buttonVariants({
                      variant: 'ghost',
                      className: cn(
                        'max-lg:h-11 w-full justify-start gap-2.5 px-2.5',
                        'border-amber-500/50 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-300',
                        collapsed && 'justify-center gap-0 border-0 px-0',
                      ),
                    }),
                    isActive && 'bg-amber-500/15 ring-1 ring-amber-500/30',
                  )
                }
              >
                {/* Sign-in affordance: `LogIn`, so it cannot be confused
                    with the `key` route icon in the nav map above. */}
                <LogIn className="size-4.5 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{signIn.label}</span>}
              </NavLink>
            ) : (
              <div className={cn('flex items-center gap-1', collapsed ? 'justify-center' : 'px-2.5')}>
                {!collapsed && signIn.roleLabel && (
                  <Badge variant="outline" className="max-w-full truncate">
                    {signIn.roleLabel}
                    {signIn.keyPrefix ? ` ${signIn.keyPrefix}` : ''}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  // Ends whichever credential is active — a password session if
                  // there is one, otherwise the stored key — and the notice
                  // under this block says which.
                  onClick={() => {
                    void signOut().then((result) => {
                      toast.info(
                        result.kind === 'session'
                          ? `Signed out — the session for ${result.username ?? 'this account'} is gone.`
                          : 'Signed out — the stored API key is gone.',
                      )
                      onNavigate?.()
                    })
                  }}
                  aria-label={collapsed ? signIn.label : undefined}
                  className={cn(
                    'max-lg:h-11 w-full justify-start gap-2.5 px-0 text-muted-foreground hover:text-foreground',
                    collapsed && 'justify-center gap-0',
                  )}
                >
                  <LogOut className="size-4.5 shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{signIn.label}</span>}
                </Button>
              </div>
            )}
            {/* Both footer `title={signIn.title}` tooltips are gone (WCAG
                1.4.13), and `signInNotice` — the consequence clause computed
                above — is their non-hover home: one visible line under the
                control, in the same `text-[11px] text-muted-foreground` subtext
                the shell already uses (`App.tsx:121`,
                `ProviderModelSelect.tsx:268`). Not rendered in the icon rail:
                `w-16` has no room for a sentence, so there the control keeps its
                accessible name and what the click did is reported by the toast it
                already raises. The credential model the sentence describes is
                spelled out on the `/login` page, which stays reachable from ⌘K
                (the record's `palette: true`, `src/lib/routes.ts:118`) and from
                the top bar (`TopBar.tsx:109`) at every role. */}
            {!collapsed && (
              <p className="px-2.5 text-[11px] leading-snug text-muted-foreground">{signInNotice}</p>
            )}
          </>
        )}

        <Separator />
        {!collapsed && (
          <p className="px-2.5 text-xs leading-relaxed text-muted-foreground">
            Read-mostly studio for the Zolai Core API; role-gated writes go through the credential
            you sign in with. Ground truth: ZVS 2018 orthography, SOV order, ergative{' '}
            <span className="font-mono">in</span>.
          </p>
        )}
        <Button
          variant="link"
          size="sm"
          // `asChild` so the link is a real anchor, not a button that navigates.
          asChild
        >
          <a
            href="https://github.com/Zolai-AI"
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              'h-auto max-lg:h-10 justify-start px-2.5 text-xs text-muted-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <ExternalLink aria-hidden />
            {/* The destination must be reachable without hovering (WCAG 1.4.13),
                and in the collapsed rail there is no visible text at all. So the
                accessible name is "Zolai-AI org on GitHub" in both states: when
                collapsed it is carried entirely by the `sr-only` span (icon-only
                visually); when expanded the visible "Zolai-AI org" is a substring
                of that name and ` on GitHub` extends it for screen readers
                (label-in-name holds). */}
            {collapsed ? (
              <span className="sr-only">Zolai-AI org on GitHub</span>
            ) : (
              <>
                Zolai-AI org
                <span className="sr-only"> on GitHub</span>
              </>
            )}
          </a>
        </Button>
      </div>
    </nav>
  )
}
