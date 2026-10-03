import { AlertTriangle, KeyRound, RefreshCw, WifiOff, Clock } from 'lucide-react'
import { ApiError, isApiError } from '../lib/api'
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
    <div
      role="alert"
      className={`flex gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-rose-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rose-200">{title}</p>
        <p className="mt-1 text-xs leading-relaxed break-words text-rose-200/80">{message}</p>
        {hint && <p className="mt-1 text-xs text-rose-200/60">{hint}</p>}
        {onRetry && retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-400/40 px-2.5 py-1 text-xs font-medium text-rose-200 transition hover:bg-rose-400/10"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Retry
          </button>
        )}
      </div>
    </div>
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