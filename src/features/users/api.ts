/**
 * Admin user accounts (`/admin/users`): list, create, role/enabled, password,
 * revoke sessions.
 *
 * Every route is strict server-side — `require_scope('user:manage')` **and**
 * `require_role('admin')`, both `strict=True` — so warn mode does not
 * dual-accept an absent credential here, and the UI additionally mounts the
 * panel behind the admin role.
 *
 * Credential rules: a password travels **only** in the request body of the call
 * the user typed it into — it is never stored in state after submit, never
 * logged, never toasted, and the server never returns one (responses are
 * `sanitize_user` rows with the argon2 hash stripped, and revoke-sessions
 * returns a count, never a token).
 *
 * The `fetch*` / `post*` / `put*` functions are plain async transport + parse,
 * exported so the node-env tests can assert method, path and body with a
 * stubbed `fetch`; the hooks are the React Query surface over them.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from '../../lib/api'
import { endpointPath } from '../../lib/endpoints'
import {
  AdminUserEnvelopeSchema,
  AdminUserListSchema,
  RevokeSessionsSchema,
  parseOrThrow,
  type AdminUser,
  type AdminUserList,
  type RevokeSessionsResult,
} from '../../lib/schemas'

const QKEY = ['admin', 'users'] as const

/** Server vocabulary for `role` (`VALID_ROLES` in zolai-core). */
export const USER_ROLES = ['member', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export type AdminUserCreateInput = {
  username: string
  /** Min 8 characters server-side; there is no default password. */
  password: string
  display_name?: string
  role?: UserRole
}

/** Partial update — at least one field is required by the server. */
export type AdminUserUpdate = {
  role?: UserRole
  enabled?: boolean
}

export async function fetchAdminUsers(signal?: AbortSignal): Promise<AdminUserList> {
  return parseOrThrow(
    AdminUserListSchema,
    await apiGet<unknown>(endpointPath('admin.users.list'), { signal }),
    'admin users',
  )
}

export async function createAdminUser(input: AdminUserCreateInput): Promise<AdminUser> {
  const payload: Record<string, unknown> = {
    username: input.username.trim(),
    password: input.password,
  }
  const displayName = input.display_name?.trim()
  if (displayName) payload.display_name = displayName
  if (input.role) payload.role = input.role
  const envelope = await parseOrThrow(
    AdminUserEnvelopeSchema,
    await apiPost<unknown>(endpointPath('admin.users.create'), payload),
    'created user',
  )
  return envelope.user
}

export async function updateAdminUser(
  username: string,
  update: AdminUserUpdate,
): Promise<AdminUser> {
  const payload: Record<string, unknown> = {}
  if (update.role !== undefined) payload.role = update.role
  if (update.enabled !== undefined) payload.enabled = update.enabled
  const envelope = await parseOrThrow(
    AdminUserEnvelopeSchema,
    await apiPut<unknown>(endpointPath('admin.users.update', { username }), payload),
    'updated user',
  )
  return envelope.user
}

/** Replace a password — the server revokes every live session for that user. */
export async function setAdminUserPassword(
  username: string,
  password: string,
): Promise<AdminUser> {
  const envelope = await parseOrThrow(
    AdminUserEnvelopeSchema,
    await apiPut<unknown>(endpointPath('admin.users.password', { username }), { password }),
    'updated password',
  )
  return envelope.user
}

/** Logout-everywhere for one account — a count back, never a token. */
export async function revokeAdminUserSessions(username: string): Promise<RevokeSessionsResult> {
  return parseOrThrow(
    RevokeSessionsSchema,
    await apiPost<unknown>(
      endpointPath('admin.users.revoke_sessions', { username }),
      undefined,
    ),
    'revoked sessions',
  )
}

export function useAdminUsers() {
  return useQuery({
    queryKey: QKEY,
    queryFn: ({ signal }) => fetchAdminUsers(signal),
  })
}

/** Shared list invalidation — every write below mutates the same rows. */
function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: QKEY })
}

export function useCreateAdminUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: AdminUserCreateInput): Promise<AdminUser> => createAdminUser(input),
    onSuccess: invalidate,
  })
}

export function useUpdateAdminUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({
      username,
      update,
    }: {
      username: string
      update: AdminUserUpdate
    }): Promise<AdminUser> => updateAdminUser(username, update),
    onSuccess: invalidate,
  })
}

export function useSetAdminUserPassword() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string
      password: string
    }): Promise<AdminUser> => setAdminUserPassword(username, password),
    // The server revoked the user's sessions on the password change.
    onSuccess: invalidate,
  })
}

export function useRevokeAdminUserSessions() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (username: string): Promise<RevokeSessionsResult> =>
      revokeAdminUserSessions(username),
    onSuccess: invalidate,
  })
}
