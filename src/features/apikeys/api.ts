/**
 * Admin API-key surface (`/admin/api-keys`): list, create, rotate, revoke.
 *
 * Every route is **strict** `apikey:manage` server-side, so warn mode does not
 * dual-accept an absent key here.
 *
 * Credential handling — the reason this file looks different from the other
 * feature transports:
 *   - create/rotate return a plaintext secret **once**. A React Query *mutation*
 *     would park that secret in the mutation cache, so these two calls are plain
 *     transports invoked directly from the component, which keeps the value in
 *     one local `useState` and drops it when the dialog closes;
 *   - the list (metadata only, no plaintext exists at rest) *is* a query, and
 *     rotating/revoking invalidate it;
 *   - nothing here logs, toasts or returns a secret.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  ApiKeyIssuedSchema,
  ApiKeyListSchema,
  ApiKeyRevokedSchema,
  ApiKeyRotateSchema,
  parseOrThrow,
  type ApiKeyIssued,
  type ApiKeyList,
  type ApiKeyRevoked,
  type ApiKeyRotated,
} from '../../lib/schemas'

const QKEY = ['admin', 'api-keys'] as const

/** Body of `POST /admin/api-keys` — scopes must come from the frozen vocabulary. */
export type ApiKeyCreateInput = {
  name: string
  scopes: string[]
  expires_days?: number | null
  created_by?: string
}

export async function fetchApiKeys(signal?: AbortSignal): Promise<ApiKeyList> {
  return parseOrThrow(
    ApiKeyListSchema,
    await apiGet<unknown>(endpointPath('admin.apikeys.list'), { signal }),
    'api keys',
  )
}

/** Issue a key. The returned `plaintext` is shown once and never stored. */
export async function createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyIssued> {
  return parseOrThrow(
    ApiKeyIssuedSchema,
    await apiPost<unknown>(endpointPath('admin.apikeys.create'), {
      name: input.name.trim(),
      scopes: input.scopes,
      ...(input.expires_days ? { expires_days: input.expires_days } : {}),
      ...(input.created_by ? { created_by: input.created_by } : {}),
    }),
    'issued api key',
  )
}

/** Issue a replacement and revoke the old one. Plaintext is shown once. */
export async function rotateApiKey(keyId: number): Promise<ApiKeyRotated> {
  return parseOrThrow(
    ApiKeyRotateSchema,
    await apiPost<unknown>(endpointPath('admin.apikeys.rotate', { key_id: keyId }), undefined),
    'rotated api key',
  )
}

export async function revokeApiKey(keyId: number): Promise<ApiKeyRevoked> {
  return parseOrThrow(
    ApiKeyRevokedSchema,
    await apiPost<unknown>(endpointPath('admin.apikeys.revoke', { key_id: keyId }), undefined),
    'revoked api key',
  )
}

export function useApiKeys() {
  return useQuery({
    queryKey: QKEY,
    queryFn: ({ signal }) => fetchApiKeys(signal),
  })
}

/** Invalidate the list after a revoke or a rotation. */
export function useInvalidateApiKeys() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: QKEY })
}

/** A key is usable only when it is neither revoked nor expired. */
export function isActiveKey(row: {
  revoked_at?: string | null
  expires_at?: string | null
}): boolean {
  if (row.revoked_at) return false
  if (!row.expires_at) return true
  const expiry = new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime()
  return Number.isFinite(expiry) ? expiry > Date.now() : true
}