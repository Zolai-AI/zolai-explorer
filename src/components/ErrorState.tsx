import { AlertTriangle, Clock, KeyRound, RefreshCw, ShieldAlert, WifiOff, XCircle } from 'lucide-react'
import { ApiError, isApiError } from '../lib/api'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

/**
 * How a failure is *presented*.
 *
 * - `destructive` — something broke: the network, a timeout, a 5xx.
 * - `warning` — the server answered and the answer is "not this way": a
 *   refused credential, a session or key without the scope.
 * - `neutral` — the request was refused on purpose (403).
 *
 * A refused credential is not a failure and a 403 is not an outage, so neither
 * wears the red failure surface; only a genuine fault does.
 */
type ErrorTone = 'destructive' | 'warning' | 'neutral'

/** Which failure the classifier recognised — the stable contract toasts branch
 *  on, so copy can be reworded without breaking a `startsWith` comparison. */
type ErrorCode =
  | 'needsKey'
  | 'timeout'
  | 'forbidden'
  | 'network'
  | 'aborted'
  | 'parse'
  | 'http'
  | 'unknown'

/** One failure classified into copy, icon, retryability and tone. */
export type ErrorDescription = {
  code: ErrorCode
  title: string
  message: string
  hint?: string
  Icon: typeof AlertTriangle
  retryable: boolean
  tone: ErrorTone
}

/**
 * The app's single failure classifier.
 *
 * `ErrorState` renders it; toasts in `Agent.tsx` / `Assistant.tsx` take the
 * same title and message — the panel and the toast for one failure must not
 * drift into different taxonomies.
 */
export function describeError(error: unknown): ErrorDescription {
  if (isApiError(error)) {
    const apiError = error as ApiError
    if (apiError.needsKey) {
      // 401 means "the credential this request carried was not accepted", and
      // two different credentials can be carried: an expired session is refused
      // exactly like a revoked key. Wording that named only the key told a
      // session user to go paste a key they did not need. `failureDetail`
      // concatenates message + hint, so both lines stay inside the toast budget.
      return {
        code: 'needsKey',
        title: 'Credential refused',
        message: 'The server refused the credential this request carried.',
        hint: 'A session can expire and a key can be revoked — sign in again from the top bar.',
        Icon: KeyRound,
        retryable: false,
        tone: 'warning',
      }
    }
    if (apiError.kind === 'timeout') {
      return {
        code: 'timeout',
        title: 'Request timed out',
        message: apiError.message,
        hint: 'The client-side request budget elapsed before the Zolai Core API answered. Retry the request.',
        Icon: Clock,
        retryable: true,
        tone: 'destructive',
      }
    }
    // 403 is *not* "missing key" — that is 401 and drives the key prompt. Here
    // the server recognised the credential and refused the permission. The
    // detail for a role failure is the bare token `forbidden`, which explains
    // nothing on its own, so say what it actually means instead of echoing it.
    if (apiError.status === 403) {
      const informative = apiError.message !== '' && apiError.message !== 'forbidden'
      return {
        code: 'forbidden',
        title: 'Not permitted',
        message: informative
          ? apiError.message
          : 'The server refused this request — this credential does not carry the scope or role it requires.',
        hint: 'The role comes from the server, so a demotion or a credential without the scope applies on the very next request.',
        Icon: ShieldAlert,
        retryable: false,
        tone: 'neutral',
      }
    }
    if (apiError.kind === 'network') {
      return {
        code: 'network',
        title: 'Cannot reach the API',
        // The raw fetch message ("Failed to fetch") is browser plumbing, not
        // information — say what happened in human terms.
        message: 'The browser could not open a connection to the Zolai Core API.',
        hint: 'Check network access to api.zolai.space.',
        Icon: WifiOff,
        retryable: true,
        tone: 'destructive',
      }
    }
    if (apiError.kind === 'aborted') {
      return {
        code: 'aborted',
        title: 'Request cancelled',
        message: 'The request was cancelled before it answered.',
        Icon: XCircle,
        retryable: true,
        tone: 'destructive',
      }
    }
    if (apiError.kind === 'parse') {
      return {
        code: 'parse',
        title: 'Unreadable response',
        message: 'The API answered, but not as JSON this app understands.',
        Icon: AlertTriangle,
        retryable: true,
        tone: 'destructive',
      }
    }
    return {
      code: 'http',
      title: `Request failed (HTTP ${apiError.status})`,
      message: apiError.message,
      Icon: AlertTriangle,
      retryable: apiError.status >= 500,
      tone: 'destructive',
    }
  }
  return {
    code: 'unknown',
    title: 'Something went wrong',
    // Never echo a raw exception: `String(error)` on an arbitrary throw can
    // carry request internals, and a screenshot-able string must not be a
    // leak surface. The detail belongs in the console, not the panel.
    message: 'The request did not complete.',
    Icon: AlertTriangle,
    retryable: true,
    tone: 'destructive',
  }
}

/**
 * The classified failure as one line, for a toast description.
 *
 * Toasts carry no icon or retry affordance, so they want message + hint joined;
 * living here keeps that join from being re-implemented (and drifting) per file.
 *
 * The 403 hint is the one exception: it is background about how roles work, not
 * a next step, and appended to a toast it doubles the sentence length for no
 * action the user can take. The panel keeps it.
 */
export function failureDetail(error: unknown): string {
  const d = describeError(error)
  if (d.code === 'forbidden') return d.message
  return d.hint ? `${d.message} ${d.hint}` : d.message
}

/**
 * One failure surface for the whole app.
 *
 * The tone classes live here so a missing key, a refused permission and a
 * genuine outage cannot drift into three different looks, and the destructive
 * surface comes from the `--destructive-surface` / `--destructive-border`
 * tokens rather than a red glyph on an empty card.
 */
const TONE_CLASS: Record<Exclude<ErrorTone, 'destructive'>, string> = {
  warning:
    'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 *:data-[slot=alert-description]:text-current',
  neutral: 'border-border bg-muted/50 text-foreground *:data-[slot=alert-description]:text-current',
}

export function ErrorState({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  compact?: boolean
}) {
  const { title, message, hint, Icon, retryable, tone } = describeError(error)
  return (
    <Alert
      variant={tone === 'destructive' ? 'destructive' : 'default'}
      className={cn(compact ? 'p-3' : 'p-4', tone !== 'destructive' && TONE_CLASS[tone])}
    >
      <Icon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words">
        {message}
        {/* Dimming the hint (it was `opacity-80` on a description already drawn at
            `/90`) stacked two fades and landed the line at 3.37:1 — WCAG 1.4.3
            wants 4.5:1. It is separated by its own line instead. */}
        {hint && <span className="mt-1 block">{hint}</span>}
        {onRetry && retryable && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <RefreshCw aria-hidden />
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Full-panel wrapper so every panel fails the same way.
 *
 * It delegates to `ErrorState` rather than picking a different component per
 * cause: a 401 used to render an `Empty` here and an `Alert` everywhere else,
 * so the same failure looked like "no data" on one panel and like a failure on
 * the next.
 */
export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <ErrorState error={error} onRetry={onRetry} />
}
