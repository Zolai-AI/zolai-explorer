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
import { isApiError } from '../../lib/api'
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
 *   - create/rotate/revoke are plain async calls with local pending state, not
 *     React Query mutations, precisely so a secret cannot land in the mutation
 *     cache (see `features/apikeys/api.ts`).
 */
export function ApiKeysPanel() {
  const keys = useApiKeys()
  const invalidate = useInvalidateApiKeys()
  const [issueOpen, setIssueOpen] = useState(false)

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
              <ApiKeyRow key={row.id} row={row} onChanged={invalidate} />
            ))}
          </ul>
        )}
      </Card>

      <IssueKeyDialog open={issueOpen} onClose={() => setIssueOpen(false)} onIssued={invalidate} />
    </div>
  )
}

function ApiKeyRow({ row, onChanged }: { row: ApiKeyRecord; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const active = isActiveKey(row)

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
        <div className="flex gap-1">
          <dt>scopes</dt>
          <dd className="font-mono">{row.scopes.length > 0 ? row.scopes.join(' ') : '—'}</dd>
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
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <ShieldAlert className="size-3.5" aria-hidden />
            Copy this secret now — the server will never show it again.
          </p>
          <code className="mt-1.5 block break-all font-mono text-xs">{issued}</code>
          {/* A minting path parks a secret in component state, so it must also
              offer a way to drop it — the rotate banner used to linger until
              the row unmounted or the next action. */}
          <Button
            variant="outline"
            size="xs"
            className="mt-2 h-auto max-lg:h-9 px-2 text-[11px]"
            onClick={() => setIssued(null)}
          >
            <X aria-hidden />
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
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
        <Button
          variant="outline"
          size="sm"
          className="max-lg:h-10"
          disabled={busy || !active}
          onClick={() => void act('revoke')}
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
    </li>
  )
}

/**
 * Issue a key. The plaintext comes back from `POST /admin/api-keys` exactly once
 * and is shown in this dialog; closing it discards the value.
 */
function IssueKeyDialog({
  open,
  onClose,
  onIssued,
}: {
  open: boolean
  onClose: () => void
  onIssued: () => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState('dataset:read')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [issued, setIssued] = useState<string | null>(null)

  const close = () => {
    setIssued(null)
    setName('')
    setScopes('dataset:read')
    setError(undefined)
    onClose()
  }

  const issue = async () => {
    const cleanName = name.trim()
    if (cleanName === '') {
      setError('Name the key so it can be recognised later, e.g. mcp-server.')
      return
    }
    const parsed = scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter((scope) => scope !== '')
    if (parsed.length === 0) {
      setError('At least one scope is required — the server rejects an empty list.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const result = await createApiKey({ name: cleanName, scopes: parsed })
      setIssued(result.plaintext)
      onIssued()
    } catch (err: unknown) {
      setError(describe(err))
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
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <ShieldAlert className="size-3.5" aria-hidden />
              Copy this secret now — it is not recoverable afterwards.
            </p>
            <code className="mt-1.5 block break-all font-mono text-xs">{issued}</code>
          </div>
        ) : (
          <form
            className="space-y-2"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void issue()
            }}
          >
            <Field data-invalid={error ? 'true' : undefined}>
              <FieldLabel htmlFor="apikey-name">Name</FieldLabel>
              <Input
                id="apikey-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="mcp-server"
                className="h-10 font-mono"
              />
            </Field>
            <Field data-invalid={error ? 'true' : undefined}>
              <FieldLabel htmlFor="apikey-scopes">Scopes</FieldLabel>
              <Input
                id="apikey-scopes"
                value={scopes}
                onChange={(event) => setScopes(event.target.value)}
                placeholder="dataset:read rag:read"
                className="h-10 font-mono"
              />
              <FieldError>{error}</FieldError>
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Space- or comma-separated, from the frozen vocabulary. <code className="font-mono">*</code>{' '}
              grants every scope — including <code className="font-mono">apikey:manage</code>.
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

/** One short line for an inline error — no stack traces, no key material. */
function describe(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401 || error.status === 403) {
      return 'This browser has no apikey:manage key active — sign in with an admin key first.'
    }
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}