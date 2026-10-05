/**
 * Endpoint bindings for the admin AI-provider catalog (`/admin/ai-providers`).
 *
 * Every route is strict scope-gated server-side (`settings:read` /
 * `settings:write`); the UI additionally hides Settings behind `admin`, but an
 * honest 401/403 from a stale role still surfaces through `ApiError`.
 *
 * The `fetch*` / `put*` functions are plain async transport + parse, exported
 * so the node-env tests can assert method, path and body with a stubbed
 * `fetch`; the hooks are the React Query surface over them.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  ActivateSchema,
  ProviderListSchema,
  ProviderSchema,
  ProviderTestSchema,
  parseOrThrow,
  type ActivateResult,
  type Provider,
  type ProviderList,
  type ProviderTest,
} from '../../lib/schemas'

const BASE = endpointPath('admin.providers.list')
const QKEY = ['admin', 'ai-providers'] as const

/** Fields a PUT may carry — `catalog_id`/`adapter` are immutable server-side. */
export type ProviderUpdate = {
  name?: string
  base_url?: string
  models?: string[]
  selected_model?: string
  enabled?: boolean
  tier?: string
  timeout_s?: number
  /** Write-only: stored server-side, never echoed back. */
  secret?: string
  /** Write-only: store an `env:NAME` reference instead of a literal. */
  secret_env?: string
  clear_secret?: boolean
}

export async function fetchAiProviders(signal?: AbortSignal): Promise<ProviderList> {
  return parseOrThrow(
    ProviderListSchema,
    await apiGet<unknown>(BASE, { signal }),
    'ai providers',
  )
}

export async function putAiProvider(
  catalogId: string,
  update: ProviderUpdate,
): Promise<Provider> {
  return parseOrThrow(
    ProviderSchema,
    await apiPut<unknown>(endpointPath('admin.providers.update', { catalog_id: catalogId }), update),
    'ai provider',
  )
}

export async function postActivateProvider(catalogId: string): Promise<ActivateResult> {
  return parseOrThrow(
    ActivateSchema,
    await apiPost<unknown>(endpointPath('admin.providers.activate', { catalog_id: catalogId }), undefined),
    'activate provider',
  )
}

export async function postTestProvider(catalogId: string): Promise<ProviderTest> {
  return parseOrThrow(
    ProviderTestSchema,
    await apiPost<unknown>(endpointPath('admin.providers.test', { catalog_id: catalogId }), undefined),
    'provider test',
  )
}

export function useAiProviders() {
  return useQuery({
    queryKey: QKEY,
    queryFn: ({ signal }) => fetchAiProviders(signal),
  })
}

export function useUpsertProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      catalogId,
      update,
    }: {
      catalogId: string
      update: ProviderUpdate
    }): Promise<Provider> => putAiProvider(catalogId, update),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QKEY }),
  })
}

export function useActivateProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (catalogId: string): Promise<ActivateResult> =>
      postActivateProvider(catalogId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QKEY }),
  })
}

export function useTestProvider() {
  return useMutation({
    mutationFn: (catalogId: string): Promise<ProviderTest> => postTestProvider(catalogId),
  })
}
