import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

/**
 * Query defaults tuned for a read-mostly knowledge workbench:
 *   - `retry: 1` so a transient 5xx is retried once but a 4xx is not hammered,
 *   - `retry` skipped entirely for 401/403 and 4xx (a key prompt is more useful
 *     than three identical failures),
 *   - `staleTime: 60s` because the knowledge base is rebuilt on a slow cadence,
 *   - `refetchOnWindowFocus: false` so tab switches do not re-hit the API.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.status === 0) return failureCount < 1
          if (error.status >= 400 && error.status < 500) return false
          return failureCount < 1
        }
        return failureCount < 1
      },
      retryDelay: 400,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: false,
    },
  },
})