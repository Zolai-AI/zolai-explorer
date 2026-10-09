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
 * every value comes from the server payload, and `defaultSelection` picks the
 * first row the server called active rather than naming one.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  ProviderCatalogSchema,
  RefreshModelsSchema,
  parseOrThrow,
  type ProviderCatalog,
  type ProviderSelection,
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

/**
 * The default target: the **first row the server returned** (the catalog is
 * served in catalog order, active row first) with its `selected_model`, falling
 * back to the first model it publishes. Empty catalog → empty selection, which
 * the UI renders as "server default" rather than inventing a target.
 */
export function defaultSelection(items: readonly PublicProvider[]): ProviderSelection {
  const first = items[0]
  if (!first) return { provider: '', model: '' }
  return {
    provider: first.catalog_id,
    model: first.selected_model || first.models[0] || '',
  }
}

/** Models published by one catalog row — what the model `<Select>` offers. */
export function modelsFor(
  items: readonly PublicProvider[],
  catalogId: string,
): readonly string[] {
  return items.find((item) => item.catalog_id === catalogId)?.models ?? []
}
