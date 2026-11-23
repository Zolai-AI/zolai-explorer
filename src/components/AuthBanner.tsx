import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { authModeNotice, useAuthMe } from '../lib/auth'
import { signInPath } from '../lib/routes'
import type { StorageLike } from '../lib/key'

const DISMISS_KEY = 'zolai.authBannerDismissedMode'

/**
 * The dismissal kernel, kept apart from the DOM for the same reason as
 * `lib/sidebar.ts`: a `StorageLike` argument makes it testable in plain Node,
 * and `sessionStorage` is *absent* under a static render and *throws* in a
 * hardened or partitioned context. A blocked store must cost persistence only
 * — the notice shows again — never the shell.
 */
export function readDismissedMode(storage: StorageLike | null | undefined): string | null {
  try {
    const value = storage?.getItem(DISMISS_KEY)
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function writeDismissedMode(storage: StorageLike | null | undefined, mode: string): void {
  try {
    storage?.setItem(DISMISS_KEY, mode)
  } catch {
    // Ignored on purpose — muting for this tab still works through state.
  }
}

/** Only the *same* mode stays muted; a flip re-shows the notice on its way back. */
export function bannerMuted(stored: string | null, mode: string): boolean {
  return stored !== null && stored === mode
}

/** `sessionStorage` itself, or `null` when reading it would throw. */
function sessionStorageLike(): StorageLike | null {
  try {
    return typeof globalThis.sessionStorage !== 'undefined' ? globalThis.sessionStorage : null
  } catch {
    return null
  }
}

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
 *
 * #6: dismissible for the session. The dismissal stores **the mode it muted**,
 * not a blanket flag, so it survives reloads of the same warn-mode tab and
 * still comes back if the deployment flips and returns — a stored `warn` says
 * nothing about a later `warn`. Nothing else clears it; a new browser session
 * sees the notice again.
 */
export function AuthBanner() {
  const me = useAuthMe()
  const location = useLocation()
  const [dismissedMode, setDismissedMode] = useState<string | null>(() =>
    readDismissedMode(sessionStorageLike()),
  )
  const notice = authModeNotice(me.mode, me.role)
  if (!notice.show) return null
  if (bannerMuted(dismissedMode, me.mode)) return null

  const dismiss = () => {
    writeDismissedMode(sessionStorageLike(), me.mode)
    setDismissedMode(me.mode)
  }

  return (
    <Alert className="relative mb-4 border-amber-500/40 bg-amber-500/5 pe-12">
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 size-8 max-lg:size-10"
        onClick={dismiss}
        aria-label="Dismiss this notice for this session"
      >
        <X aria-hidden />
      </Button>
    </Alert>
  )
}
