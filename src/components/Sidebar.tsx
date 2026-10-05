import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  Bot,
  Database,
  ExternalLink,
  Gauge,
  KeyRound,
  Link2,
  MessageSquareQuote,
  ScanText,
  Search,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { can, useRole, type Role } from '../lib/auth'
import { NAV_ROUTES, type RouteIconName } from '../lib/routes'
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
  database: Database,
  link: Link2,
  settings: Settings2,
  key: KeyRound,
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
 * Primary navigation, filtered by the role the server reports.
 *
 * Each item is a shadcn `<Button variant="ghost">` rendered `asChild` into a
 * router `<NavLink>`, so the active state comes from `aria-current` styling
 * rather than a parallel mechanism.
 *
 * `onNavigate` lets the mobile `<Sheet>` close itself after a tap.
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
  const items = NAV_ITEMS.filter((item) => can(role, item.minRole ?? 'anonymous'))

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
              end={to === '/'}
              title={description}
              onClick={onNavigate}
              className="block"
            >
              {({ isActive }) => (
                <Button
                  variant="ghost"
                  // 44px rows: comfortably past the 40px mobile touch target.
                  className={cn(
                    'max-lg:h-11 w-full justify-start gap-2.5 px-2.5',
                    isActive
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/15'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    collapsed && 'justify-center gap-0 px-0',
                  )}
                  // Icon-only mode: the label is hidden visually but the
                  // accessible name and the tooltip title still carry it.
                  aria-label={collapsed ? label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Button>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={cn('mt-auto space-y-2 pt-3', collapsed && 'w-full')}>
        <Separator />
        {!collapsed && (
          <p className="px-2.5 text-[10px] leading-relaxed text-muted-foreground">
            Read-mostly studio for the Zolai Core API; role-gated writes go through your key.
            Ground truth: ZVS 2018 orthography, SOV order, ergative{' '}
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
            title="Zolai-AI org on GitHub"
            className={cn(
              'h-auto max-lg:h-10 justify-start px-2.5 text-xs text-muted-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <ExternalLink aria-hidden />
            {!collapsed && 'Zolai-AI org'}
          </a>
        </Button>
      </div>
    </nav>
  )
}
