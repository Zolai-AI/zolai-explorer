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
import {
  confirmationFor,
  createAccountFields,
  enabledAdminCount,
  enabledSuperadminCount,
  endsOwnSession,
  isAdminOrAbove,
  isSelf,
  roleAction,
  toggleAction,
  type AccountAction,
  type AccountConfirmation,
} from './accountActions'
import { Card } from '../../components/Card'
import { Empty } from '../../components/Empty'
import { ErrorPanel } from '../../components/ErrorState'
import { Notice } from '../../components/Notice'
import { Skeleton } from '../../components/Skeleton'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { describeError, failureDetail } from '../../components/ErrorState'
import { can, roleBadge, useAuthMe } from '../../lib/auth'
import { formatCount, formatTimestamp } from '../../lib/format'
import { signOut } from '../../lib/session'
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
 *
 * What it must *say*, because the server stops the *system* and not the
 * *caller* (`accountActions.ts` quotes the exact guards in `session_auth.py`):
 * every write that narrows access or drops live sessions goes through a confirm
 * step, the row the server says is *you* is marked as such, and the warning names
 * what this browser loses — including when the answer is "the writer refuses this,
 * so nothing changes". A role pick writes the role that was *picked* (admin or
 * superadmin, from either side of the current one), never a re-derived guess.
 */
export function UsersPanel() {
  const users = useAdminUsers()
  // The server's answer to "who am I?" — the only identity source (never the
  // stored key). `username` is present only for a session credential.
  const me = useAuthMe()
  const [createOpen, setCreateOpen] = useState(false)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const items = users.data?.items ?? []
  // Read from the full list — `GET /admin/users` is unpaginated, so these are
  // real totals rather than pages pretending to be one. Two counts, because two
  // different questions matter: who can still open this panel (`enabledAdmins`),
  // and who can still put a role back (`enabledSuperadmins`).
  const enabledAdmins = enabledAdminCount(items)
  const enabledSuperadmins = enabledSuperadminCount(items)
  // Whether *this credential* can move a role. The writer's first guard is the
  // caller's role, so an admin and a superadmin clicking the same row get
  // different answers from the same route — the copy has to know which one is
  // holding the mouse. Server's answer, never a scope read off the stored key.
  const actorIsSuperadmin = can(me.role, 'superadmin')

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
        ) : items.length === 0 ? (
          <Empty
            title="No accounts yet"
            hint="Accounts are created here or with the `zolai user create` CLI. There is no sign-up path: a username/password login only works for an account an admin made."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={isSelf(user, me.username)}
                enabledAdmins={enabledAdmins}
                enabledSuperadmins={enabledSuperadmins}
                actorIsSuperadmin={actorIsSuperadmin}
                onChangePassword={() => setPasswordFor(user.username)}
              />
            ))}
          </ul>
        )}
      </Card>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        actorIsSuperadmin={actorIsSuperadmin}
      />
      <PasswordDialog
        username={passwordFor}
        // The server revokes every live session of the target, so this is the
        // one case where the admin's own browser is signed out by the request.
        ownSessionEnds={endsOwnSession({
          targetUsername: passwordFor ?? '',
          me: me.username,
          authSource: me.auth_source,
        })}
        onClose={() => setPasswordFor(null)}
      />
    </div>
  )
}

function UserRow({
  user,
  isSelf: self,
  enabledAdmins,
  enabledSuperadmins,
  actorIsSuperadmin,
  onChangePassword,
}: {
  user: AdminUser
  isSelf: boolean
  enabledAdmins: number
  enabledSuperadmins: number
  actorIsSuperadmin: boolean
  onChangePassword: () => void
}) {
  const update = useUpdateAdminUser()
  const revoke = useRevokeAdminUserSessions()
  const busy = update.isPending || revoke.isPending
  // Same display copy the rest of the shell derives from a role, so a row cannot
  // call `superadmin` something the TopBar does not.
  const badge = roleBadge(user.role)
  /** The write waiting on a confirm step, with the copy that explains it. */
  const [pending, setPending] = useState<{
    action: AccountAction
    /** The role a role-write moves to — the pick must survive the confirm step. */
    nextRole: UserRole | null
    confirmation: AccountConfirmation
  } | null>(null)

  const execute = (action: AccountAction, nextRole: UserRole | null) => {
    if (action === 'revoke-sessions') {
      revoke.mutate(user.username, {
        onSuccess: (result) =>
          toast.success(`Signed ${user.username} out everywhere.`, {
            description: `${formatCount(result.revoked)} session${result.revoked === 1 ? '' : 's'} revoked — a count, never a token.`,
          }),
        onError: (error: unknown) =>
          toast.error('Could not revoke sessions', { description: describe(error) }),
      })
      return
    }

    if (action === 'enable' || action === 'disable') {
      const enabled = action === 'enable'
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
      return
    }

    if (action === 'promote' || action === 'demote') {
      // The role that was *picked*, not a re-derivation from the direction: with
      // three stored roles, `promote` means "to admin" only when the row already
      // was a member, and writing the wrong one here would be a silent privilege
      // change the confirm step never described.
      if (nextRole === null) return
      update.mutate(
        { username: user.username, update: { role: nextRole } },
        {
          onSuccess: () => toast.success(`${user.username} is now ${nextRole}.`),
          onError: (error: unknown) =>
            toast.error('Could not change the role', { description: describe(error) }),
        },
      )
      return
    }
  }

  /**
   * Confirm first when the write needs a confirm step, otherwise run it.
   *
   * The decision is pure and unit-tested (`accountActions.ts`): the server's writer
   * guards the *system* (only a superadmin moves a role, nobody their own, never
   * the last enabled superadmin), and this copy is what tells the *caller* what
   * they lose — including when the answer is "the server refuses this, so nothing
   * changes".
   */
  const request = (action: AccountAction, nextRole: UserRole | null = null) => {
    const confirmation = confirmationFor({
      action,
      account: user,
      isSelf: self,
      enabledAdmins,
      enabledSuperadmins,
      actorIsSuperadmin,
      nextRole,
    })
    if (!confirmation) {
      execute(action, nextRole)
      return
    }
    setPending({ action, nextRole, confirmation })
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
        {self && <Badge variant="outline">you</Badge>}
        {user.display_name && (
          <span className="truncate text-xs text-muted-foreground">{user.display_name}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <Badge variant={badge.variant}>
            {isAdminOrAbove(user.role) && <ShieldCheck aria-hidden />}
            {badge.label}
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
          <FieldLabel
            {...(actorIsSuperadmin ? { htmlFor: `role-${user.id}` } : {})}
            className="text-[11px]"
          >
            Role
          </FieldLabel>
          {actorIsSuperadmin ? (
            <Select
              value={user.role}
              onValueChange={(next) => {
                const target = next as UserRole
                request(roleAction(user.role, target), target)
              }}
              disabled={busy}
            >
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
          ) : (
            /* Not a disabled select. `PUT /admin/users/{username}` routes *any*
               `role` in the body through the guarded writer — even a value that
               matches the row — so an admin who "just opened the box" and picked
               the current rank would earn a 403 `role_change_requires_superadmin`.
               The rank the row already shows is the whole truth an admin gets. */
            <p className="mt-1 text-sm leading-10 font-medium">
              {badge.label}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                set by a superadmin
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* The other half of the split: `user:manage` enables and disables
              *members*, while an admin-or-above account needs a superadmin in
              either direction (`target_requires_superadmin`). A control the
              server would refuse is not offered, and the reason is printed. */}
          {actorIsSuperadmin || !isAdminOrAbove(user.role) ? (
            <Button
              variant="outline"
              size="sm"
              className="max-lg:h-10"
              disabled={busy}
              onClick={() => request(toggleAction(user))}
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
          ) : (
            <p className="flex items-center text-[11px] leading-8 text-muted-foreground">
              {user.enabled ? 'Disabling' : 'Enabling'} an admin-or-above account is a superadmin’s
              call.
            </p>
          )}
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
            disabled={busy}
            onClick={() => request('revoke-sessions')}
          >
            <RotateCcw aria-hidden />
            Revoke sessions
          </Button>
        </div>
      </div>

      {pending && (
        <AlertDialog open onOpenChange={(next) => !next && setPending(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription>{pending.confirmation.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="max-lg:h-10">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="max-lg:h-10"
                variant={pending.confirmation.destructive ? 'destructive' : 'default'}
                onClick={() => {
                  const { action, nextRole } = pending
                  // Close first: the action is already decided, and leaving the
                  // dialog up over a pending row invites a second click.
                  setPending(null)
                  execute(action, nextRole)
                }}
              >
                {pending.confirmation.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  )
}

/**
 * Create an account — username + password required, role defaults to member.
 *
 * The role picker only exists for a superadmin. `POST /admin/users` refuses
 * `role != "member"` from anyone below that (`403 role_change_requires_superadmin`)
 * *before* inserting, so a refusal means no account at all — an admin who was
 * shown the box and picked `admin` would get an error, not a half-created row.
 * A non-superadmin therefore omits `role` from the body (the server defaults it
 * to `member`) and is told where the rank is set: the users list on this panel,
 * or `zolai user set-role`.
 */
function CreateUserDialog({
  open,
  onClose,
  actorIsSuperadmin,
}: {
  open: boolean
  onClose: () => void
  actorIsSuperadmin: boolean
}) {
  const create = useCreateAdminUser()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [password, setPassword] = useState('')
  /**
   * Per-field validation plus one request-level line.
   *
   * These were a single `error` string rendered under the *Password* field, so
   * "A username is required" read as a password problem. Each message now sits
   * beside the input it came from (label → input → error, joined by id); what
   * the server said belongs to neither input, so it is a notice, not a field
   * error.
   */
  const [errors, setErrors] = useState<{ username?: string; password?: string; request?: string }>(
    {},
  )

  useEffect(() => {
    if (open) {
      setUsername('')
      setDisplayName('')
      setRole('member')
      setPassword('')
      setErrors({})
    }
  }, [open])

  const submit = () => {
    const name = username.trim()
    const found: { username?: string; password?: string } = {}
    if (name === '') {
      found.username = 'A username is required.'
    }
    if (password.length < MIN_PASSWORD) {
      found.password = `The password must be at least ${MIN_PASSWORD} characters — the server rejects shorter ones.`
    }
    if (found.username || found.password) {
      setErrors(found)
      return
    }
    create.mutate(
      {
        username: name,
        password,
        ...createAccountFields({ displayName, role, actorIsSuperadmin }),
      },
      {
        onSuccess: (user) => {
          toast.success(`Created ${user.username}.`, {
            description: 'The password was sent once to create the account and is not stored here.',
          })
          setPassword('')
          onClose()
        },
        onError: (err: unknown) => setErrors({ request: describe(err) }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPassword('')
          setErrors({})
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
          {errors.request && (
            <Notice tone="danger" title="The account was not created">
              {errors.request}
            </Notice>
          )}
          <Field data-invalid={errors.username ? 'true' : undefined}>
            <FieldLabel htmlFor="new-username">Username</FieldLabel>
            <Input
              id="new-username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                if (errors.username) {
                  setErrors((previous) => ({ ...previous, username: undefined }))
                }
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="username"
              aria-invalid={errors.username ? true : undefined}
              aria-describedby={errors.username ? 'new-username-error' : undefined}
              className="h-10"
            />
            <FieldError id="new-username-error">{errors.username}</FieldError>
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

          {actorIsSuperadmin ? (
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
              <FieldDescription className="text-xs">
                Starting a row above member is a role change, and only this credential is ranked to
                make one. It can also be done after the fact from the row’s Role control.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel>Role</FieldLabel>
              <p className="text-sm leading-10 font-medium">
                member
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  the only rank an admin can create
                </span>
              </p>
              <FieldDescription className="text-xs">
                A row that starts at admin or superadmin is a role change, and the server refuses one
                from this credential — the account would not be created at all. Create it as a member,
                then a superadmin promotes it from the row’s Role control (or with{' '}
                <code className="font-mono">zolai user set-role</code>).
              </FieldDescription>
            </Field>
          )}

          <Field data-invalid={errors.password ? 'true' : undefined}>
            <FieldLabel htmlFor="new-password">Password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (errors.password) {
                  setErrors((previous) => ({ ...previous, password: undefined }))
                }
              }}
              placeholder={`at least ${MIN_PASSWORD} characters`}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'new-password-error' : undefined}
              className="h-10 font-mono"
            />
            <FieldError id="new-password-error">{errors.password}</FieldError>
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
function PasswordDialog({
  username,
  ownSessionEnds,
  onClose,
}: {
  username: string | null
  /** The server will revoke the *caller's own* session in this request. */
  ownSessionEnds: boolean
  onClose: () => void
}) {
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
          if (ownSessionEnds) {
            // `change_password` revokes every live session of the target, and
            // this target is the account this browser is signed in as — so the
            // stored token is already dead. Dropping it here is what keeps the
            // app honest: otherwise the shell keeps reporting the old role and
            // every panel 401s until a reload. (`signOut()` clears local state
            // first, then best-effort calls `/auth/logout` with a token the
            // server has already revoked.)
            void signOut()
            toast.success(`Password changed for ${username}.`, {
              description:
                'The server revoked every live session for that account — including this one, so you have been signed out. Sign in again with the new password.',
            })
          } else {
            toast.success(`Password changed for ${username}.`, {
              description: 'Every live session for that account was revoked by the server.',
            })
          }
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
            never stores or displays it.{' '}
            {ownSessionEnds
              ? 'This is your own account: the server revokes every live session for it, including the one in this browser, so you will be signed out.'
              : 'The server revokes every live session for that account.'}
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
              onChange={(event) => {
                setPasswordValue(event.target.value)
                if (error) setError(undefined)
              }}
              placeholder={`at least ${MIN_PASSWORD} characters`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'new-user-password-error' : undefined}
              className="h-10 font-mono"
            />
            <FieldError id="new-user-password-error">{error}</FieldError>
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

/** One short line for a toast — no stack traces, no credential material. The
 *  classification is `describeError`'s; only the no-credential case, which says
 *  what *this* panel needs, is local. */
function describe(error: unknown): string {
  const d = describeError(error)
  // 401 means nothing was accepted, so the panel names the credential it needs.
  // 403 is the opposite — the credential was recognised and refused a
  // *permission* — and the role writer answers with a sentence naming the rule
  // it hit. Flattening that to "admin access required" told a superadmin who
  // tried to change their own role that they were not an admin.
  if (d.code === 'needsKey') {
    return 'Admin access required — an admin credential must be active in this browser.'
  }
  return failureDetail(error)
}
