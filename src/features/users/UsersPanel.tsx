import { useEffect, useState } from 'react'
import { Ban, KeyRound, Plus, RotateCcw, ShieldCheck, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  USER_ROLES,
  useAdminUsers,
  useCreateAdminUser,
  useRevokeAdminUserSessions,
  useSetAdminUserPassword,
  useUpdateAdminUser,
  type UserRole,
} from './api'
import { Card } from '../../components/Card'
import { Empty } from '../../components/Empty'
import { ErrorPanel } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Field, FieldError, FieldLabel } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { isApiError } from '../../lib/api'
import { formatCount, formatTimestamp } from '../../lib/format'
import type { AdminUser } from '../../lib/schemas'

/** Server minimum for a password (`UserCreateIn` / `UserPasswordIn`). */
const MIN_PASSWORD = 8

/**
 * Admin users panel — list, create, enable/disable, change role, change
 * password, revoke sessions.
 *
 * What this panel is allowed to see:
 *   - rows are `sanitize_user` output: role, enabled, timestamps — never a
 *     password hash, never a token (the server strips the hash before it
 *     serialises, and revoke-sessions returns a **count**);
 *   - a password exists only in the field the admin typed it into and in the
 *     body of the one call that sends it — it is cleared on success and on
 *     close, never toasted, never cached;
 *   - every call is strict server-side (`user:manage` + admin role), so a stale
 *     browser role surfaces as an honest 401/403 rather than a silent no-op.
 */
export function UsersPanel() {
  const users = useAdminUsers()
  const [createOpen, setCreateOpen] = useState(false)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Users"
        subtitle="GET /admin/users · strict user:manage + admin role"
        bodyClassName="flex flex-col gap-4"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden />
            Add user
          </Button>
        }
      >
        {users.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <span className="sr-only">Loading users…</span>
          </div>
        ) : users.isError ? (
          <ErrorPanel error={users.error} onRetry={() => void users.refetch()} />
        ) : (users.data?.items.length ?? 0) === 0 ? (
          <Empty
            title="No accounts yet"
            hint="Accounts are created here or with the `zolai user create` CLI. There is no sign-up path: a username/password login only works for an account an admin made."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {users.data?.items.map((user) => (
              <UserRow key={user.id} user={user} onChangePassword={() => setPasswordFor(user.username)} />
            ))}
          </ul>
        )}
      </Card>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <PasswordDialog username={passwordFor} onClose={() => setPasswordFor(null)} />
    </div>
  )
}

function UserRow({
  user,
  onChangePassword,
}: {
  user: AdminUser
  onChangePassword: () => void
}) {
  const update = useUpdateAdminUser()
  const revoke = useRevokeAdminUserSessions()
  const busy = update.isPending || revoke.isPending

  const setEnabled = (enabled: boolean) => {
    update.mutate(
      { username: user.username, update: { enabled } },
      {
        onSuccess: () =>
          toast.success(enabled ? `${user.username} enabled.` : `${user.username} disabled.`, {
            description: enabled
              ? 'The account can sign in again.'
              : 'The server revoked every live session for this account.',
          }),
        onError: (error: unknown) =>
          toast.error('Could not change the state', { description: describe(error) }),
      },
    )
  }

  const setRole = (role: UserRole) => {
    update.mutate(
      { username: user.username, update: { role } },
      {
        onSuccess: () => toast.success(`${user.username} is now ${role}.`),
        onError: (error: unknown) =>
          toast.error('Could not change the role', { description: describe(error) }),
      },
    )
  }

  const revokeSessions = () => {
    revoke.mutate(user.username, {
      onSuccess: (result) =>
        toast.success(`Signed ${user.username} out everywhere.`, {
          description: `${formatCount(result.revoked)} session${result.revoked === 1 ? '' : 's'} revoked — a count, never a token.`,
        }),
      onError: (error: unknown) =>
        toast.error('Could not revoke sessions', { description: describe(error) }),
    })
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={user.enabled ? 'secondary' : 'outline'}>
          {user.enabled ? 'enabled' : 'disabled'}
        </Badge>
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{user.username}</span>
        </span>
        {user.display_name && (
          <span className="truncate text-xs text-muted-foreground">{user.display_name}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
            {user.role === 'admin' && <ShieldCheck aria-hidden />}
            {user.role}
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground">#{user.id}</span>
        </span>
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <div className="flex gap-1">
          <dt>created</dt>
          <dd>{user.created_at ? formatTimestamp(user.created_at) : '—'}</dd>
        </div>
        <div className="flex gap-1">
          <dt>last login</dt>
          <dd>{user.last_login ? formatTimestamp(user.last_login) : 'never'}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-32">
          <FieldLabel htmlFor={`role-${user.id}`} className="text-[11px]">
            Role
          </FieldLabel>
          <Select value={user.role} onValueChange={(next) => setRole(next as UserRole)} disabled={busy}>
            <SelectTrigger id={`role-${user.id}`} className="mt-1 h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            disabled={busy}
            onClick={() => setEnabled(!user.enabled)}
          >
            {user.enabled ? (
              <>
                <Ban aria-hidden />
                Disable
              </>
            ) : (
              <>
                <ShieldCheck aria-hidden />
                Enable
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            disabled={busy}
            onClick={onChangePassword}
          >
            <KeyRound aria-hidden />
            Change password
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            disabled={busy || revoke.isPending}
            onClick={revokeSessions}
          >
            <RotateCcw aria-hidden />
            Revoke sessions
          </Button>
        </div>
      </div>
    </li>
  )
}

/** Create an account — username + password required, role defaults to member. */
function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAdminUser()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setUsername('')
      setDisplayName('')
      setRole('member')
      setPassword('')
      setError(undefined)
    }
  }, [open])

  const submit = () => {
    const name = username.trim()
    if (name === '') {
      setError('A username is required.')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(`The password must be at least ${MIN_PASSWORD} characters — the server rejects shorter ones.`)
      return
    }
    create.mutate(
      {
        username: name,
        password,
        ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
        role,
      },
      {
        onSuccess: (user) => {
          toast.success(`Created ${user.username}.`, {
            description: 'The password was sent once to create the account and is not stored here.',
          })
          setPassword('')
          onClose()
        },
        onError: (err: unknown) => setError(describe(err)),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassword('')
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            POST /admin/users — there is no sign-up path, so an account only exists because an admin
            created it here (or with the <code className="font-mono">zolai user</code> CLI).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field data-invalid={error ? 'true' : undefined}>
            <FieldLabel htmlFor="new-username">Username</FieldLabel>
            <Input
              id="new-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="username"
              className="h-10"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="new-display-name">Display name (optional)</FieldLabel>
            <Input
              id="new-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="off"
              placeholder="Peter Pau Sian Lian"
              className="h-10"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="new-role">Role</FieldLabel>
            <Select value={role} onValueChange={(next) => setRole(next as UserRole)}>
              <SelectTrigger id="new-role" className="mt-1 h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={error ? 'true' : undefined}>
            <FieldLabel htmlFor="new-password">Password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`at least ${MIN_PASSWORD} characters`}
              className="h-10 font-mono"
            />
            <FieldError>{error}</FieldError>
          </Field>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" className="max-lg:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="max-lg:h-10" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Replace one account's password — the server drops its live sessions too. */
function PasswordDialog({ username, onClose }: { username: string | null; onClose: () => void }) {
  const setPassword = useSetAdminUserPassword()
  const [password, setPasswordValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (username) {
      setPasswordValue('')
      setError(undefined)
    }
  }, [username])

  const submit = () => {
    if (!username) return
    if (password.length < MIN_PASSWORD) {
      setError(`The password must be at least ${MIN_PASSWORD} characters — the server rejects shorter ones.`)
      return
    }
    setPassword.mutate(
      { username, password },
      {
        onSuccess: () => {
          toast.success(`Password changed for ${username}.`, {
            description: 'Every live session for that account was revoked by the server.',
          })
          setPasswordValue('')
          onClose()
        },
        onError: (err: unknown) => setError(describe(err)),
      },
    )
  }

  return (
    <Dialog
      open={username !== null}
      onOpenChange={(next) => {
        if (!next) {
          setPasswordValue('')
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            For <span className="font-mono">{username}</span> — sent once in the PUT body; this app
            never stores or displays it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field data-invalid={error ? 'true' : undefined}>
            <FieldLabel htmlFor="new-user-password">New password</FieldLabel>
            <Input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
              placeholder={`at least ${MIN_PASSWORD} characters`}
              className="h-10 font-mono"
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" className="max-lg:h-10" onClick={onClose}>
              <X aria-hidden />
              Cancel
            </Button>
            <Button type="submit" className="max-lg:h-10" disabled={setPassword.isPending}>
              {setPassword.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One short line for a toast — no stack traces, no credential material. */
function describe(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401 || error.status === 403)
      return 'Admin access required — an admin credential must be active in this browser.'
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
