import { QueryClient } from '@tanstack/react-query'
import { queryDefaultOptions } from '@zolai/ai-kit/client'

/** Defaults are owned by `@zolai/ai-kit`; this file only constructs the client. */
export const queryClient = new QueryClient({ defaultOptions: queryDefaultOptions })
