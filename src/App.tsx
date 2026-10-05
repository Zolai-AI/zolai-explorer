import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { Dashboard } from './routes/Dashboard'
import { Word } from './routes/Word'
import { Analyze } from './routes/Analyze'
import { Search } from './routes/Search'
import { Rag } from './routes/Rag'
import { Data } from './routes/Data'
import { Links } from './routes/Links'
import { Login } from './routes/Login'
import { Settings } from './routes/Settings'
import { Assistant } from './routes/Assistant'
import { Agent } from './routes/Agent'
import { NotFound } from './routes/NotFound'
import { KeyDialog } from './components/KeyDialog'
import { Empty } from './components/Empty'
import { Button } from './components/ui/button'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { queryClient } from './lib/queryClient'
import { can, roleBadge, useRole, type Role } from './lib/auth'

/**
 * Role gate for a route.
 *
 * A missing privilege renders a **prompt** (what is wrong, how to fix it, and the
 * sign-in page one click away) — never a 404. The route component itself never
 * runs without its role, so an admin-only panel cannot fire an admin API call on
 * a member key.
 */
export function RequireRole({ minimum, children }: { minimum: Role; children: ReactNode }) {
  const role = useRole()
  const location = useLocation()
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)

  if (can(role, minimum)) return <>{children}</>

  const needed = roleBadge(minimum)
  const have = roleBadge(role)

  return (
    <div className="flex flex-col gap-4">
      <Empty
        title={`${needed.label} access required`}
        hint={`This area needs the ${needed.label.toLowerCase()} role on the server. You are currently ${have.label.toLowerCase()} — sign in with a key that carries it.`}
        icon={<KeyRound className="size-5" aria-hidden />}
      >
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {/* Sign in first: it verifies the key before storing it, so a rejected
              paste cannot leave the browser in a half-authenticated state. */}
          <Button className="h-10" asChild>
            <Link to={`/login?from=${encodeURIComponent(location.pathname)}`}>
              <KeyRound aria-hidden />
              Sign in…
            </Link>
          </Button>
          <Button className="h-10" variant="outline" onClick={() => setKeyDialogOpen(true)}>
            <KeyRound aria-hidden />
            Paste a key…
          </Button>
        </div>
        <p className="mt-2 max-w-prose text-[11px] leading-relaxed text-muted-foreground">
          {needed.hint}
        </p>
      </Empty>
      <KeyDialog open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="word" element={<Word />} />
              <Route path="word/:word" element={<Word />} />
              <Route path="analyze" element={<Analyze />} />
              <Route path="search" element={<Search />} />
              <Route path="rag" element={<Rag />} />
              <Route path="assistant" element={<Assistant />} />
              <Route
                path="agent"
                element={
                  <RequireRole minimum="member">
                    <Agent />
                  </RequireRole>
                }
              />
              <Route
                path="settings"
                element={
                  <RequireRole minimum="admin">
                    <Settings />
                  </RequireRole>
                }
              />
              <Route path="data" element={<Data />} />
              <Route path="links" element={<Links />} />
              {/* Public sign-in: it verifies a key with GET /auth/me, so it must
                  be reachable *before* any privilege is held. */}
              <Route path="login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          <Toaster position="bottom-right" />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}