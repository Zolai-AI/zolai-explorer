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
import {
  DASHBOARD_PATH,
  PARAM_VARIANTS,
  ROUTES,
  gateMinimum,
  routeByPath,
  routePathForVariant,
  signInPath,
  type RoutePath,
} from './lib/routes'

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
            <Link to={signInPath(location.pathname)}>
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

/**
 * Panel per registry path.
 *
 * Keyed by `RoutePath`, so a registry entry without a component — or a component
 * for a path that no longer exists — fails `tsc` instead of producing a dead
 * nav card. The `/word/:word` deep link is a `PARAM_VARIANTS` entry and reuses
 * the `/word` panel.
 *
 * The panels are **ungated** on purpose: `pageFor` wraps them in `RequireRole`
 * using `gateMinimum(routeByPath(path))`, so a role is written down exactly
 * once — in `src/lib/routes.ts`. Hand-writing `minimum="admin"` here is what
 * let the `/settings` gate silently disagree with the registry.
 */
const PAGES: Record<RoutePath, ReactNode> = {
  '/': <Dashboard />,
  '/login': <Login />,
  '/word': <Word />,
  '/analyze': <Analyze />,
  '/search': <Search />,
  '/rag': <Rag />,
  '/assistant': <Assistant />,
  '/agent': <Agent />,
  '/data': <Data />,
  '/links': <Links />,
  '/settings': <Settings />,
}

/** `/word` → `word` (React Router paths are relative, and `/` is the index). */
function relativePath(path: RoutePath): string {
  return path === DASHBOARD_PATH ? '' : path.replace(/^\//, '')
}

/** Render the panel for a registry path, gating on the registry's own minRole. */
function pageFor(path: RoutePath | undefined): ReactNode {
  if (!path) return <NotFound />
  const page = PAGES[path]
  const minimum = gateMinimum(routeByPath(path))
  return minimum ? <RequireRole minimum={minimum}>{page}</RequireRole> : page
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route element={<AppShell />}>
              {/* Generated from the route registry — see src/lib/routes.ts. */}
              {ROUTES.map((spec) =>
                spec.path === DASHBOARD_PATH ? (
                  <Route key={spec.id} index element={pageFor(spec.path)} />
                ) : (
                  <Route key={spec.id} path={relativePath(spec.path)} element={pageFor(spec.path)} />
                ),
              )}
              {PARAM_VARIANTS.map((variant) => {
                const base = routePathForVariant(variant.pattern)
                return (
                  <Route
                    key={variant.pattern}
                    path={relativePath(variant.pattern as RoutePath)}
                    element={pageFor(base)}
                  />
                )
              })}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          <Toaster position="bottom-right" />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}