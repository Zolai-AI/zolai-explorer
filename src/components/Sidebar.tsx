import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  Database,
  ExternalLink,
  Gauge,
  Link2,
  MessageSquareQuote,
  ScanText,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Gauge, description: 'Knowledge totals and service health' },
  { to: '/word', label: 'Word', icon: BookOpen, description: 'Word entry with sub-resources' },
  { to: '/analyze', label: 'Analyze', icon: ScanText, description: 'Sentence and paragraph analysis' },
  { to: '/search', label: 'Search', icon: Search, description: 'Cross-corpus retrieval' },
  { to: '/rag', label: 'RAG', icon: MessageSquareQuote, description: 'Retrieval-augmented snippets' },
  { to: '/data', label: 'Data', icon: Database, description: 'Statistics and knowledge version' },
  { to: '/links', label: 'Links', icon: Link2, description: 'External API surface' },
]

/**
 * Primary navigation. Each item is a shadcn `<Button variant="ghost">` rendered
 * `asChild` into a router `<NavLink>`, so the active state comes from
 * `aria-current` styling rather than a parallel mechanism.
 *
 * `onNavigate` lets the mobile `<Sheet>` close itself after a tap.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="scrollbar-thin flex h-full w-full flex-col gap-1 overflow-y-auto p-3"
    >
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, description }) => (
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
                  className={`max-lg:h-11 w-full justify-start gap-2.5 px-2.5 ${
                    isActive
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/15'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </Button>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2 pt-3">
        <Separator />
        <p className="px-2.5 text-[10px] leading-relaxed text-muted-foreground">
          Read-only studio for the Zolai Core API. Ground truth: ZVS 2018 orthography, SOV order,
          ergative <span className="font-mono">in</span>.
        </p>
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
            className="h-auto max-lg:h-10 justify-start px-2.5 text-xs text-muted-foreground"
          >
            <ExternalLink aria-hidden />
            Zolai-AI org
          </a>
        </Button>
      </div>
    </nav>
  )
}
