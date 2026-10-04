import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { NAV_ITEMS, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { Button } from './ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet'

/**
 * App shell.
 *
 * Mobile-first: below `lg` the navigation lives in a shadcn `<Sheet>` drawer
 * opened from a hamburger in the top bar; from `lg` up it is a persistent
 * 15rem sidebar. The routed panel area is width-capped so long payloads never
 * stretch across a wide display.
 */
export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  // Never leave the drawer open across a navigation.
  useEffect(() => setMobileNavOpen(false), [location.pathname])

  const active = NAV_ITEMS.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )

  return (
    <div className="flex min-h-full bg-background">
      {/* Persistent sidebar from lg up. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-sidebar lg:block">
        <Sidebar />
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
                    {active?.description ?? 'Read-only studio over the Zolai Core API'}
                  </SheetDescription>
                </SheetHeader>
                <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
          }
        />

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>

        <footer className="border-t px-4 py-4 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          Zolai Explorer — read-only studio over the Zolai Core API. Language ground truth is ZVS
          2018: SOV word order, ergative <span className="font-mono">in</span>,{' '}
          <span className="font-mono">kei</span> negation. RAG answers on this deployment are
          placeholder echoes, not model-generated text.
        </footer>
      </div>
    </div>
  )
}
