import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { authModeNotice, useAuthMe } from '../lib/auth'
import { signInPath } from '../lib/routes'

/**
 * Auth-mode banner.
 *
 * The deployment runs the API in `warn` mode: unauthenticated requests are
 * accepted, and it can flip to `enforce` at any time. Nothing is broken yet,
 * which is exactly why the notice belongs in the shell rather than in an error —
 * it states the mode (from `GET /auth/me`, never guessed), offers a Sign in
 * one click, and disappears the moment the mode changes.
 *
 * It never claims a key is required today: that would be a false warning.
 */
export function AuthBanner() {
  const me = useAuthMe()
  const location = useLocation()
  const notice = authModeNotice(me.mode, me.role)
  if (!notice.show) return null

  return (
    <Alert className="mb-4 border-amber-500/40 bg-amber-500/5">
      <ShieldAlert aria-hidden />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="max-w-prose">{notice.body}</span>
        {notice.cta && (
          <Button asChild variant="outline" size="sm" className="max-lg:h-10">
            <Link to={signInPath(location.pathname)}>{notice.cta}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}