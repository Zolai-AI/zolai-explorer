import { useState } from 'react'
import { Ban, KeyRound, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  createApiKey,
  isActiveKey,
  rotateApiKey,
  revokeApiKey,
  useApiKeys,
  useInvalidateApiKeys,
} from '../../features/apikeys/api'
import { Card } from '../../components/Card'
import { CopyValue } from '../../components/CopyValue'
import { Empty } from '../../components/Empty'
import { describeError, ErrorPanel, failureDetail } from '../../components/ErrorState'
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
import { Field, FieldError, FieldLabel } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { mintRefusal } from './keyActions'
import { useAuthMe, type Role } from '../../lib/auth'
import { formatTimestamp } from '../../lib/format'
import type { ApiKeyRecord } from '../../lib/schemas'

/**
 * Admin API-key panel — list, issue, rotate, revoke.
 *
 * Credential rules this component keeps:
 *   - a **minted plaintext secret is shown once** in the surface that produced
 *     it, and lives only in that component's local state. It is never written to
 *     the query cache, never toasted, never put in a URL, and the input is
 *     cleared on close;
 *   - **every** minting path needs both an end *and* a dismiss: the issue dialog
 *     clears on close, and the rotate banner has an explicit "Dismiss" so the
 *     secret cannot sit on screen with no way to drop it;
 *   - the *stored* key is only ever shown masked (`zolai_sk_ab••••••`), matching
 *     what the top-bar dialog shows;
 *   - **revoke is confirmed**, because it cannot be undone from this screen: the
 *     button opens an `<AlertDialog>` that names the key by its label and id
 *     (never key material) and only its destructive action sends the write;
 *   - create/rotate/revoke are plain async calls with local pending state, not
 *     React Query mutations, precisely so a secret cannot land in the mutation
 *     cache (see `features/apikeys/api.ts`).
 *
 * And the one cap that is about *rank* rather than credentials: minting is
 * limited to the caller's own rank (`403 scope_above_actor`), checked before the
 * request so an admin is never invited to type `*` and eat an error — see
 * `keyActions.ts`.
 */
export function ApiKeysPanel() {
  const keys = useApiKeys()
  const invalidate = useInvalidateApiKeys()
  const [issueOpen, setIssueOpen] = useState(false)
  // The cap is against *this* credential's rank, so the panel needs the server's
  // answer for it — the same `GET /auth/me` the rest of the shell reads.
  const me = useAuthMe()

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="API keys"
        subtitle="GET /admin/api-keys · strict apikey:manage"
        bodyClassName="flex flex-col gap-4"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            onClick={() => setIssueOpen(true)}
          >
            <Plus aria-hidden />
            Issue key
          </Button>
        }
      >
        {keys.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <span className="sr-only">Loading API keys…</span>
          </div>
        ) : keys.isError ? (
          <ErrorPanel error={keys.error} onRetry={() => void keys.refetch()} />
        ) : (keys.data?.items.length ?? 0) === 0 ? (
          <Empty
            title="No API keys"
            hint="Nothing has been issued from this deployment. The first key is bootstrapped with the `zolai apikey` CLI, because minting one requires an existing apikey:manage key."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.data?.items.map((row) => (
              <ApiKeyRow key={row.id} row={row} actorRole={me.role} onChanged={invalidate} />
            ))}
          </ul>
        )}
      </Card>

      <IssueKeyDialog
        open={issueOpen}
        actorRole={me.role}
        onClose={() => setIssueOpen(false)}
        onIssued={invalidate}
      />
    </div>
  )
}

function ApiKeyRow({
  row,
  actorRole,
  onChanged,
}: {
  row: ApiKeyRecord
  /** The caller's rank — rotation replays the old scopes, so it is re-capped. */
  actorRole: Role
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  // Revoke is irreversible, so it is never a single click: the button only
  // opens this confirm step, and the write runs from its action.
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const active = isActiveKey(row)
  // `rotate_api_key` replays this row's scopes through the same cap as a mint, so
  // an admin rotating a legacy `*` key is refused before anything is written.
  const rotateRefusal = active ? mintRefusal(row.scopes, actorRole) : null

  const act = async (action: 'rotate' | 'revoke') => {
    setBusy(true)
    try {
      if (action === 'rotate') {
        const result = await rotateApiKey(row.id)
        // Shown once, then dropped with the dialog.
        setIssued(result.plaintext)
        toast.success(`Replacement key issued for ${row.name}.`, {
          description: `Key #${row.id} was revoked in the same request. Copy the new secret now.`,
        })
      } else {
        await revokeApiKey(row.id)
        toast.success(`${row.name} revoked.`, {
          description: 'The key is rejected from the very next request.',
        })
      }
      onChanged()
    } catch (error: unknown) {
      toast.error(action === 'rotate' ? 'Rotate failed' : 'Revoke failed', {
        description: describe(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={active ? 'secondary' : 'outline'}>
          {row.revoked_at ? 'revoked' : active ? 'active' : 'expired'}
        </Badge>
        <span className="text-sm font-medium">{row.name}</span>
        <code className="font-mono text-[11px] text-muted-foreground">
          {row.key_prefix}••••••
        </code>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">#{row.id}</span>
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {/* `min-w-0` + `break-words`: a key with several scopes is one long
            mono string, and a flex item that refuses to shrink below its
            content width ran past the card at 390px. */}
        <div className="flex min-w-0 gap-1">
          <dt>scopes</dt>
          <dd className="min-w-0 break-words font-mono">
            {row.scopes.length > 0 ? row.scopes.join(' ') : '—'}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>created</dt>
          <dd>{formatTimestamp(row.created_at)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>last used</dt>
          <dd>{row.last_used_at ? formatTimestamp(row.last_used_at) : 'never'}</dd>
        </div>
        <div className="flex gap-1">
          <dt>expires</dt>
          <dd>{row.expires_at ? formatTimestamp(row.expires_at) : 'never'}</dd>
        </div>
      </dl>

      {issued && (
        <Notice
          tone="warning"
          icon={<ShieldAlert />}
          title="Copy this secret now — the server will never show it again."
        >
          <code className="mt-1.5 block break-all font-mono text-xs">{issued}</code>
          {/* Copy button for "copy this secret now" — it forwards the value the
              banner already renders once; nothing is stored, and the toast
              says only "Copied the new API key". */}
          <div className="mt-1.5">
            <CopyValue value={issued} label="the new API key" />
          </div>
          {/* A minting path parks a secret in component state, so it must also
              offer a way to drop it — the rotate banner used to linger until
              the row unmounted or the next action. The explicit touch floor
              keeps this drop-the-secret control tappable at 40px even if the
              primitive's own floor is ever lost to a vendored update. */}
          <Button
            variant="outline"
            size="xs"
            className="mt-2 max-lg:min-h-10"
            onClick={() => setIssued(null)}
          >
            <X aria-hidden />
            Dismiss
          </Button>
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        {rotateRefusal ? (
          /* Withheld, not disabled: the write is refused by rank, so there is no
             version of this click that works, and the sentence is the whole
             answer an operator needs. */
          <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            {rotateRefusal}
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="max-lg:h-10"
            disabled={busy || !active}
            onClick={() => void act('rotate')}
          >
            <RefreshCw aria-hidden />
            Rotate
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="max-lg:h-10"
          disabled={busy || !active}
          onClick={() => setConfirmRevoke(true)}
        >
          <Ban aria-hidden />
          Revoke
        </Button>
        {!active && (
          <span className="self-center text-[11px] text-muted-foreground">
            {row.revoked_at
              ? `Revoked ${formatTimestamp(row.revoked_at)}.`
              : 'Expired — rotate it to issue a working replacement.'}
          </span>
        )}
      </div>

      {/* Revoking cannot be undone from this screen — there is no un-revoke and
          no way to recover the secret — so a single click is not allowed to do
          it. The confirm step names the key by its label and id only: a masked
          prefix is already on the row, and no key material moves into a new
          surface here. */}
      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{row.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Key #{row.id} stops working on the very next request, and a revoked key cannot be
              restored — issue a new one instead. Anything still using it will start failing with
              401.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="max-lg:h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="max-lg:h-10"
              disabled={busy}
              onClick={() => {
                setConfirmRevoke(false)
                void act('revoke')
              }}
            >
              <Ban aria-hidden />
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

/**
 * Issue a key. The plaintext comes back from `POST /admin/api-keys` exactly once
 * and is shown in this dialog; closing it discards the value.
 *
 * The scopes are checked against the caller's rank first (`mintRefusal`), so the
 * form never sends a mint the server is going to refuse with `scope_above_actor`.
 */
function IssueKeyDialog({
  open,
  actorRole,
  onClose,
  onIssued,
}: {
  open: boolean
  /** Rank of the credential making the call — the cap is measured against it. */
  actorRole: Role
  onClose: () => void
  onIssued: () => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState('dataset:read')
  const [busy, setBusy] = useState(false)
  /**
   * Per-field validation plus one request-level line.
   *
   * They were a single `error` string rendered under the *Scopes* field, so a
   * missing name read as if the scopes were wrong. `name` / `scopes` attach to
   * the input they came from (label → input → error, wired by id); `request` is
   * what the server said and belongs to neither field.
   */
  const [errors, setErrors] = useState<{ name?: string; scopes?: string; request?: string }>({})
  const [issued, setIssued] = useState<string | null>(null)

  const clearFieldError = (key: 'name' | 'scopes') =>
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous))

  const close = () => {
    setIssued(null)
    setName('')
    setScopes('dataset:read')
    setErrors({})
    onClose()
  }

  const issue = async () => {
    const cleanName = name.trim()
    const parsed = scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter((scope) => scope !== '')
    const found: { name?: string; scopes?: string } = {}
    if (cleanName === '') {
      found.name = 'Name the key so it can be recognised later, e.g. mcp-server.'
    }
    if (parsed.length === 0) {
      found.scopes = 'At least one scope is required — the server rejects an empty list.'
    }
    if (!found.scopes) {
      found.scopes = mintRefusal(parsed, actorRole) ?? undefined
    }
    if (found.name || found.scopes) {
      setErrors(found)
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const result = await createApiKey({ name: cleanName, scopes: parsed })
      setIssued(result.plaintext)
      onIssued()
    } catch (err: unknown) {
      setErrors({ request: describe(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" aria-hidden />
            Issue an API key
          </DialogTitle>
          <DialogDescription>
            Scope-gated writes always name their scopes. The plaintext secret is shown once and never
            stored in this browser.
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <Notice
            tone="warning"
            icon={<ShieldAlert />}
            title="Copy this secret now — it is not recoverable afterwards."
          >
            <code className="mt-1.5 block break-all font-mono text-xs">{issued}</code>
            <div className="mt-1.5">
              <CopyValue value={issued} label="the new API key" />
            </div>
          </Notice>
        ) : (
          <form
            className="space-y-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void issue()
            }}
          >
            {/* What the server (or the network) said is not a field's problem, so
                it is not filed under one input. */}
            {errors.request && (
              <Notice tone="danger" title="The key was not issued">
                {errors.request}
              </Notice>
            )}
            <Field data-invalid={errors.name ? 'true' : undefined}>
              <FieldLabel htmlFor="apikey-name">Name</FieldLabel>
              <Input
                id="apikey-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  clearFieldError('name')
                }}
                placeholder="mcp-server"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'apikey-name-error' : undefined}
                className="h-10 font-mono"
              />
              <FieldError id="apikey-name-error">{errors.name}</FieldError>
            </Field>
            <Field data-invalid={errors.scopes ? 'true' : undefined}>
              <FieldLabel htmlFor="apikey-scopes">Scopes</FieldLabel>
              <Input
                id="apikey-scopes"
                value={scopes}
                onChange={(event) => {
                  setScopes(event.target.value)
                  clearFieldError('scopes')
                }}
                placeholder="dataset:read rag:read"
                aria-invalid={errors.scopes ? true : undefined}
                aria-describedby={errors.scopes ? 'apikey-scopes-error' : undefined}
                className="h-10 font-mono"
              />
              <FieldError id="apikey-scopes-error">{errors.scopes}</FieldError>
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Space- or comma-separated, from the frozen vocabulary. <code className="font-mono">*</code>{' '}
              grants every scope — including <code className="font-mono">role:manage</code>, which is
              what makes a key a superadmin key. A key above your own rank ({actorRole}) is refused
              before it is issued.
            </p>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" className="max-lg:h-10" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" className="max-lg:h-10" disabled={busy}>
                {busy ? 'Issuing…' : 'Issue key'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {issued && (
          <DialogFooter className="mt-4">
            <Button className="max-lg:h-10" onClick={close}>
              Done — I copied it
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One short line for an inline error — no stack traces, no key material. The
 *  classification is `describeError`'s; only the scope case, which names the
 *  scope *this* panel needs, is local. */
function describe(error: unknown): string {
  const d = describeError(error)
  if (d.code === 'needsKey' || d.code === 'forbidden') {
    return 'No apikey:manage scope on the credential this browser is sending — sign in with an admin key or account first.'
  }
  return failureDetail(error)
}