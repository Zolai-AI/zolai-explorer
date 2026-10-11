import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV_ITEMS, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { AuthBanner } from './AuthBanner'
import { KeyDialog } from './KeyDialog'
import { CommandPalette } from './CommandPalette'
import { Button } from './ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet'
import { readSidebarCollapsed, writeSidebarCollapsed } from '../lib/sidebar'
import { DASHBOARD_PATH } from '../lib/routes'

/**
 * App shell.
 *
 * Mobile-first: below `lg` the navigation lives in a shadcn `<Sheet>` drawer
 * opened from a hamburger in the top bar; from `lg` up it is a persistent
 * sidebar that can collapse to an icon rail. The routed panel area is
 * width-capped so long payloads never stretch across a wide display.
 *
 * The collapse toggle is now at the TOP of the sidebar for discoverability.
 * The sidebar uses `sticky top-0` + `h-screen` so it stays in view while
 * the main content scrolls.
 */
export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyDialogReason, setKeyDialogReason] = useState<string | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  // Never leave the drawer open across a navigation.
  useEffect(() => setMobileNavOpen(false), [location.pathname])

  // The rail is a pure `lg+` affordance; read the persisted choice after mount
  // so the server-free first paint always shows the full sidebar.
  useEffect(() => setCollapsed(readSidebarCollapsed(globalThis.localStorage)), [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeSidebarCollapsed(globalThis.localStorage, !current)
      return !current
    })
  }, [])

  const openKeyDialog = useCallback((reason?: string) => {
    setKeyDialogReason(reason)
    setKeyDialogOpen(true)
  }, [])

  const active = NAV_ITEMS.find((item) =>
    item.to === DASHBOARD_PATH
      ? location.pathname === DASHBOARD_PATH
      : location.pathname.startsWith(item.to),
  )

  useEffect(() => {
    const label = active?.label
    document.title = label ? `${label} · Zolai Studio` : 'Zolai Studio'
  }, [active])

  return (
    <div className="flex min-h-full bg-background">
      {/* Persistent sidebar from lg up; collapsible to an icon rail. */}
      <aside
        data-collapsed={collapsed ? 'true' : 'false'}
        className={`
          sticky top-0 z-10
          hidden h-screen shrink-0 border-r bg-sidebar transition-[width,margin] lg:block
          ${collapsed ? 'w-16' : 'w-60'}
        `}
      >
        {/* Collapse toggle at TOP — always visible, never scrolled away */}
        <div className="border-b p-1.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="h-9 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"
            aria-pressed={collapsed}
            title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar to icons'}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Collapse</span>
              </>
            )}
          </Button>
        </div>

        {/* Navigation content — scrolls independently, toggle stays pinned at top */}
        <div className="flex-1 overflow-y-auto">
          <Sidebar collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          nav={
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b px-4 py-3 text-left">
                  <SheetTitle className="text-sm">Zolai Explorer</SheetTitle>
                  <SheetDescription className="text-xs">
                    {active?.description ?? 'Read-mostly studio for the Zolai Core API'}
                  </SheetDescription>
                </SheetHeader>
                {/* The drawer below `lg` is always the full labelled list — the
                    rail is a desktop-only affordance. */}
                <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
          }
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenApiKey={openKeyDialog}
        />

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <div className="mx-auto w-full max-w-6xl">
            {/* Auth-mode notice (warn → enforce) sits above every panel. */}
            <AuthBanner />
            <Outlet />
          </div>
        </main>

        <footer className="border-t px-4 py-4 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          Zolai Explorer — read-mostly studio for the Zolai Core API; role-gated writes go through
          your key. Language ground truth is ZVS 2018: SOV word order, ergative{' '}
          <span className="font-mono">in</span>, <span className="font-mono">kei</span>{' '}
          negation. Assistant answers name the provider · model that wrote them;{' '}
          <span className="font-mono">/rag</span> answers are still template echoes of their own
          retrieved snippets, and say so on the panel.
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenApiKey={openKeyDialog} />
      <KeyDialog
        open={keyDialogOpen}
        reason={keyDialogReason}
        onClose={() => setKeyDialogOpen(false)}
      />
    </div>
  )
}
