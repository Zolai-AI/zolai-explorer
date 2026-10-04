import { AlertTriangle, Clock, KeyRound, RefreshCw, WifiOff } from 'lucide-react'
import { ApiError, isApiError } from '../lib/api'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { Empty } from './Empty'

function describe(error: unknown): {
  title: string
  message: string
  hint?: string
  Icon: typeof AlertTriangle
  retryable: boolean
} {
  if (isApiError(error)) {
    const apiError = error as ApiError
    if (apiError.needsKey) {
      return {
        title: 'API key required',
        message: 'The server rejected this request because the API key is missing or invalid.',
        hint: 'Open the API key dialog in the top bar and paste a valid key.',
        Icon: KeyRound,
        retryable: false,
      }
    }
    if (apiError.kind === 'timeout') {
      return {
        title: 'Request timed out',
        message: apiError.message,
        hint: 'The Zolai Core API did not answer within the 15s budget.',
        Icon: Clock,
        retryable: true,
      }
    }
    if (apiError.kind === 'network') {
      return {
        title: 'Cannot reach the API',
        message: apiError.message,
        hint: 'Check network access to api.zolai.space.',
        Icon: WifiOff,
        retryable: true,
      }
    }
    return {
      title: `Request failed (HTTP ${apiError.status})`,
      message: apiError.message,
      Icon: AlertTriangle,
      retryable: apiError.status >= 500,
    }
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : String(error),
    Icon: AlertTriangle,
    retryable: true,
  }
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
  const { title, message, hint, Icon, retryable } = describe(error)
  return (
    <Alert variant="destructive" className={compact ? 'p-3' : 'p-4'}>
      <Icon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words">
        {message}
        {hint && <span className="mt-1 block opacity-80">{hint}</span>}
        {onRetry && retryable && (
          <Button
            variant="outline"
            size="xs"
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

/** Full-panel wrapper so every panel fails the same way. */
export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isApiError(error) && (error as ApiError).needsKey) {
    return (
      <Empty
        title="API key required"
        hint="This panel is behind the versioned API surface. Open the API key dialog in the top bar to continue."
        icon={<KeyRound className="size-5" aria-hidden />}
      />
    )
  }
  return <ErrorState error={error} onRetry={onRetry} />
}
