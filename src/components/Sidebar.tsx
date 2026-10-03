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

export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-full flex-col gap-1 overflow-y-auto scrollbar-thin p-3"
    >
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, description }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              title={description}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`size-4.5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}
                    aria-hidden
                  />
                  <span className="hidden truncate md:inline">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto hidden border-t border-slate-800 pt-3 md:block">
        <p className="px-2.5 text-[10px] leading-relaxed text-slate-600">
          Read-only studio for the Zolai Core API. Ground truth: ZVS 2018 orthography, SOV order,
          ergative <span className="font-mono text-slate-500">in</span>.
        </p>
        <a
          href="https://github.com/Zolai-AI"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 flex items-center gap-1.5 px-2.5 text-[11px] text-slate-500 transition hover:text-slate-300"
        >
          <ExternalLink className="size-3" aria-hidden />
          Zolai-AI org
        </a>
      </div>
    </nav>
  )
}