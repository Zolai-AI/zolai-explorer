import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { NAV_ITEMS, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/**
 * App shell: fixed left sidebar (lucide icon + label) that collapses to icons
 * below `md`, a sticky top bar with the wordmark, live health pill and API key
 * control, and the routed panel area.
 */
export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  const active = NAV_ITEMS.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )

  return (
    <div className="flex min-h-full bg-slate-950">
      {/* Desktop sidebar: fixed, icon-only under md */}
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 border-r border-slate-800 bg-slate-950 md:block lg:w-56">
        <Sidebar />
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          />
          <aside className="absolute inset-y-0 left-0 w-60 border-r border-slate-800 bg-slate-900">
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="absolute top-3 right-3 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="size-4" aria-hidden />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        {/* Mobile nav trigger + active route label */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-300 transition hover:bg-slate-800"
          >
            <Menu className="size-4" aria-hidden />
          </button>
          <span className="text-sm font-medium text-slate-200">{active?.label ?? 'Zolai Explorer'}</span>
          <span className="truncate text-xs text-slate-500">{active?.description ?? ''}</span>
        </div>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-slate-800 px-4 py-4 text-[11px] leading-relaxed text-slate-600 sm:px-6">
          Zolai Explorer — read-only studio over the Zolai Core API. Language ground truth is ZVS
          2018: SOV word order, ergative <span className="font-mono">in</span>,{' '}
          <span className="font-mono">kei</span> negation. RAG answers on this deployment are
          placeholder echoes, not model-generated text.
        </footer>
      </div>
    </div>
  )
}