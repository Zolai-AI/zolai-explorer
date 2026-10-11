/**
 * The **public** provider catalog (`GET /api/v1/providers`) plus the admin
 * `refresh-models` action that keeps its model list current.
 *
 * Why this is a separate feature from `features/settings` (the admin catalog):
 * the two routes have different contracts and different audiences. This one is
 * anon-safe — five selection fields per row, zero secrets by construction — so
 * the chat/run selectors can offer a target with **no key at all**, while the
 * admin catalog stays behind `settings:read` / `settings:write`.
 *
 * The `fetch*` / `post*` functions are plain async transport + parse (exported
 * so the node-env tests can assert method, path and body with a stubbed
 * `fetch`); the hooks are the React Query surface over them.
 *
 * **No provider id and no model string is hardcoded anywhere in this file** —
 * every value comes from the server payload; the selectors derive their options
 * from the fetched rows alone.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  ProviderCatalogSchema,
  RefreshModelsSchema,
  parseOrThrow,
  type ProviderCatalog,
  type PublicProvider,
  type RefreshModels,
} from '../../lib/schemas'

const CATALOG_KEY = ['providers', 'catalog'] as const

/** `GET /api/v1/providers` — enabled rows only, no secrets, no key required. */
export async function fetchProviderCatalog(signal?: AbortSignal): Promise<ProviderCatalog> {
  return parseOrThrow(
    ProviderCatalogSchema,
    await apiGet<unknown>(endpointPath('providers.list'), { signal }),
    'provider catalog',
  )
}

/** `POST /admin/ai-providers/{id}/refresh-models` — strict `settings:write`. */
export async function postRefreshModels(catalogId: string): Promise<RefreshModels> {
  return parseOrThrow(
    RefreshModelsSchema,
    await apiPost<unknown>(
      endpointPath('admin.providers.refresh_models', { catalog_id: catalogId }),
      undefined,
    ),
    'refreshed models',
  )
}

export function useProviderCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: ({ signal }) => fetchProviderCatalog(signal),
  })
}

/** Re-read the catalog after a refresh so the model `<Select>` shows the new list. */
export function useRefreshModels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (catalogId: string): Promise<RefreshModels> => postRefreshModels(catalogId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
  })
}

/** Models published by one catalog row — what the model `<Select>` offers. */
export function modelsFor(
  items: readonly PublicProvider[],
  catalogId: string,
): readonly string[] {
  return items.find((item) => item.catalog_id === catalogId)?.models ?? []
}

/**
 * The model `<Select>` placeholder. It depends on the **chosen provider**, not
 * merely on the model list: no provider yet is "pick a provider first" (nothing
 * is broken), a chosen provider that publishes nothing says so honestly, and a
 * chosen provider with models invites a pick. Pure so the decision lives in one
 * place (the component) and is unit-tested.
 */
export function modelPlaceholder(provider: string, models: readonly string[]): string {
  if (provider === '') return 'Select a provider first'
  if (models.length === 0) return 'No model list published'
  return 'Select a model…'
}
