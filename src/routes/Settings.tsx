import { useEffect, useState } from 'react'
import { KeyRound, Plug, Settings2, Star } from 'lucide-react'
import { toast } from 'sonner'
import {
  useActivateProvider,
  useAiProviders,
  useTestProvider,
  useUpsertProvider,
} from '../features/settings/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorPanel } from '../components/ErrorState'
import { Skeleton } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Field, FieldError, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { isApiError } from '../lib/api'
import { formatCount } from '../lib/format'
import type { Provider } from '../lib/schemas'

/**
 * AI-provider catalog — the admin half of the Studio's role-gated writes.
 *
 * Honesty rules that apply here:
 * - the `secret` column renders the server's **mask** (`••••` / `env:NAME`)
 *   only — a plaintext key is never fetched, echoed, or kept in state;
 * - the paste-key dialog is write-only: the value goes into one PUT and is
 *   dropped, never displayed back;
 * - a failed test shows the server's error text rather than an optimistic tick.
 */
export function Settings() {
  const providers = useAiProviders()
  const items = providers.data?.items ?? []

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Settings2 className="size-5 text-primary" aria-hidden />
          Provider settings
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Admin-only catalog of AI providers behind the assistant and agent. Stored keys are
          masked by the server — this screen never sees a plaintext value.
        </p>
      </header>

      {providers.isPending ? (
        <Card title="Catalog" subtitle="GET /admin/ai-providers">
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <span className="sr-only">Loading providers…</span>
          </div>
        </Card>
      ) : providers.isError ? (
        <ErrorPanel error={providers.error} onRetry={() => void providers.refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="No providers in the catalog"
          hint="The server seeds the catalog on boot. If this deployment has no rows, nothing can be configured here."
        />
      ) : (
        <Card
          title="Catalog"
          subtitle={`GET /admin/ai-providers · ${formatCount(items.length)} row${items.length === 1 ? '' : 's'}`}
          bodyClassName="flex flex-col gap-4"
        >
          {items.map((provider) => (
            <ProviderRow key={provider.catalog_id} provider={provider} />
          ))}
        </Card>
      )}
    </div>
  )
}

function ProviderRow({ provider }: { provider: Provider }) {
  const upsert = useUpsertProvider()
  const activate = useActivateProvider()
  const test = useTestProvider()

  const [name, setName] = useState(provider.name)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)

  // Server is the source of truth: follow a refetched row for fields we do not
  // own locally (name edits are push-on-blur, so only drift in from outside).
  useEffect(() => setName(provider.name), [provider.name])

  const rename = () => {
    const clean = name.trim()
    if (clean === '' || clean === provider.name) {
      setName(provider.name)
      return
    }
    upsert.mutate(
      { catalogId: provider.catalog_id, update: { name: clean } },
      {
        onSuccess: () => toast.success(`Renamed to “${clean}”.`),
        onError: (error: unknown) => toast.error('Rename failed', { description: describe(error) }),
      },
    )
  }

  const setModel = (model: string) => {
    upsert.mutate(
      { catalogId: provider.catalog_id, update: { selected_model: model } },
      {
        onSuccess: () => toast.success(`Model set to “${model}”.`),
        onError: (error: unknown) =>
          toast.error('Could not change the model', { description: describe(error) }),
      },
    )
  }

  const setEnabled = (enabled: boolean) => {
    upsert.mutate(
      { catalogId: provider.catalog_id, update: { enabled } },
      {
        onSuccess: () =>
          toast.success(enabled ? `${provider.name} enabled.` : `${provider.name} disabled.`),
        onError: (error: unknown) =>
          toast.error('Could not change the state', { description: describe(error) }),
      },
    )
  }

  const runActivate = () => {
    activate.mutate(provider.catalog_id, {
      onSuccess: () => toast.success(`${provider.name} is now the active provider.`),
      onError: (error: unknown) =>
        toast.error('Activate failed', { description: describe(error) }),
    })
  }

  const runTest = () => {
    test.mutate(provider.catalog_id, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(`${provider.name} answered`, {
            // `||`, not `??`: the schemas return '' for "no value", and '' is
            // falsy — `??` would render an empty tail.
            description: `${formatCount(Math.round(result.latency_ms))} ms · ${result.model || provider.selected_model || 'default model'}`,
          })
        } else {
          toast.error(`${provider.name} did not answer`, {
            description: result.error || `HTTP ${result.status ?? 'unknown'}`,
          })
        }
      },
      onError: (error: unknown) => toast.error('Test failed', { description: describe(error) }),
    })
  }

  const busy = upsert.isPending || activate.isPending || test.isPending

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={provider.is_active ? 'default' : 'secondary'}>
          {provider.is_active ? (
            <>
              <Star aria-hidden /> Active
            </>
          ) : (
            provider.adapter
          )}
        </Badge>
        {provider.is_active && <Badge variant="outline">{provider.adapter}</Badge>}
        <span className="ml-auto flex items-center gap-2">
          <Switch
            checked={provider.enabled}
            onCheckedChange={setEnabled}
            disabled={busy}
            aria-label={`Enable ${provider.name}`}
          />
          <span className="text-xs text-muted-foreground">Enabled</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel htmlFor={`name-${provider.catalog_id}`}>Display name</FieldLabel>
          <Input
            id={`name-${provider.catalog_id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                rename()
              }
            }}
            disabled={busy}
            className="mt-1 h-10"
          />
        </div>

        <div className="min-w-0">
          <FieldLabel htmlFor={`model-${provider.catalog_id}`}>Model</FieldLabel>
          {provider.models.length > 0 ? (
            <Select value={provider.selected_model} onValueChange={setModel} disabled={busy}>
              <SelectTrigger id={`model-${provider.catalog_id}`} className="mt-1 h-10 w-full">
                <SelectValue placeholder="Select a model…" />
              </SelectTrigger>
              <SelectContent>
                {provider.models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="mt-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              No model list published for this row — the server picks its default.
            </p>
          )}
        </div>
      </div>

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <KeyRound className="size-3.5" aria-hidden />
          <dt className="sr-only">Secret</dt>
          <dd className="font-mono">
            {provider.secret.configured ? provider.secret.ref_masked || '••••' : 'not configured'}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Catalog id</dt>
          <dd className="font-mono">{provider.catalog_id}</dd>
        </div>
        <div>
          <dt className="sr-only">Timeout</dt>
          <dd>{provider.timeout_s}s timeout</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="max-lg:h-10"
          disabled={busy}
          onClick={() => setKeyDialogOpen(true)}
        >
          <KeyRound aria-hidden />
          Paste key…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-lg:h-10"
          disabled={busy || provider.is_active}
          onClick={runActivate}
        >
          <Star aria-hidden />
          Activate
        </Button>
        <Button size="sm" className="max-lg:h-10" disabled={busy} onClick={runTest}>
          <Plug aria-hidden />
          {test.isPending ? 'Testing…' : 'Test connection'}
        </Button>
      </div>

      <SecretDialog
        open={keyDialogOpen}
        onClose={() => setKeyDialogOpen(false)}
        provider={provider}
      />
    </div>
  )
}

/**
 * Write-only credential dialog. The value is submitted straight into the PUT's
 * `secret` field and cleared — it is never echoed, logged, or cached.
 */
function SecretDialog({
  open,
  onClose,
  provider,
}: {
  open: boolean
  onClose: () => void
  provider: Provider
}) {
  const upsert = useUpsertProvider()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setSecret('')
      setError(undefined)
    }
  }, [open])

  const save = () => {
    if (secret.trim() === '') {
      setError('Paste a key, or close the dialog.')
      return
    }
    upsert.mutate(
      { catalogId: provider.catalog_id, update: { secret: secret.trim() } },
      {
        onSuccess: () => {
          toast.success(`Key stored for ${provider.name}.`, {
            description: 'Stored server-side and masked — it is never returned to this browser.',
          })
          setSecret('')
          onClose()
        },
        onError: (err: unknown) => setError(describe(err)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paste an API key</DialogTitle>
          <DialogDescription>
            Write-only: the value is sent once in the PUT body, stored masked by the server, and
            never displayed back here.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Field data-invalid={error ? 'true' : undefined}>
            <FieldLabel htmlFor={`secret-${provider.catalog_id}`}>Key</FieldLabel>
            <Input
              id={`secret-${provider.catalog_id}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="paste provider key"
              className="h-10 font-mono"
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" className="max-lg:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="max-lg:h-10" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Store key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One short line for a toast — no stack traces, no key material. */
function describe(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401 || error.status === 403)
      return 'Admin access required — an admin API key must be active in this browser.'
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
