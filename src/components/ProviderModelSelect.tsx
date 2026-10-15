import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  modelPlaceholder,
  modelsFor,
  reconcileSelection,
  useProviderCatalog,
  useRefreshModels,
} from '../features/providers/api'
import { ErrorState } from './ErrorState'
import { Skeleton } from './Skeleton'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { can, useRole } from '../lib/auth'
import { isApiError } from '../lib/api'
import { cn } from '../lib/utils'
import type { ProviderSelection } from '../lib/schemas'

/**
 * Two selects — provider, then model — over the **public** catalog
 * (`GET /api/v1/providers`), for the chat and run composers.
 *
 * Rules this component keeps:
 *   - **no hardcoded provider id or model string.** The options, the labels and
 *     every value sent come from the payload; `src/lib/*` guard tests fail the
 *     build if a literal ever appears in `src/`;
 *   - **no auto-seed.** An empty selection is a real choice: the request goes out
 *     with **no override** and the server resolves its own active provider.
 *     Seeding the first catalog row (whichever row sorts first — possibly one
 *     with no server key) once made anonymous chat *worse*, so the selection
 *     starts and stays empty until the user picks a row — with a "Use server
 *     default" control to get back to it;
 *   - the selection is **controlled** — the parent owns it and puts it in the
 *     request body, so what was chosen is what was sent;
 *   - a catalog that is loading, failed or empty says so honestly and leaves the
 *     request on the server's own default instead of guessing a target;
 *   - **Re-fetch catalog** is **not** role-gated: it only re-reads the public,
 *     anon-safe catalog, so a keyed member can pull a fresh list the moment a
 *     row changes. The admin **Refresh models** action stays the stronger,
 *     server-side discovery and keeps its `settings:write` gate;
 *   - the selection is **reconciled against every fresh catalog**
 *     (`reconcileSelection`): a provider that dropped off the list, or a model
 *     its row no longer publishes, is corrected instead of sent — and only when
 *     the value really differs, so the correction can never loop;
 *   - **Refresh models** is an admin action (`settings:write`), so it renders
 *     only for the admin role the server reports — never inferred from a key.
 */
export function ProviderModelSelect({
  value,
  onChange,
  idPrefix = 'provider-model',
  showRefresh = true,
  disabled = false,
  className,
}: {
  value: ProviderSelection
  onChange: (next: ProviderSelection) => void
  /** Stable prefix so each label points at its own control. */
  idPrefix?: string
  /** Opt out of both refresh affordances entirely (the admin gate still applies to "Refresh models"). */
  showRefresh?: boolean
  disabled?: boolean
  className?: string
}) {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const catalog = useProviderCatalog()
  const refresh = useRefreshModels()
  const items = catalog.data?.items ?? []

  // Explicit-only target: we deliberately do NOT seed the first catalog row.
  // An empty selection means "no override", so the server resolves its own
  // active provider — the state its own hint documents.
  const pickProvider = (catalogId: string) => {
    const row = items.find((item) => item.catalog_id === catalogId)
    // Prefer the server's `selected_model` **only when that row actually
    // publishes it** — otherwise the request 400s with PROVIDER_MODEL_UNKNOWN
    // (observed for a row whose `selected_model` was not in its own `models`).
    const model = row
      ? row.selected_model && row.models.includes(row.selected_model)
        ? row.selected_model
        : row.models[0] ?? ''
      : ''
    onChange({ provider: catalogId, model })
  }

  const runRefresh = () => {
    if (!value.provider || !isAdmin) return
    refresh.mutate(value.provider, {
      onSuccess: (result) => {
        // The server list is the truth: if the current model dropped off it,
        // fall back to the first model it still publishes.
        if (result.models.length > 0 && !result.models.includes(value.model)) {
          onChange({ provider: value.provider, model: result.models[0] ?? '' })
        }
        toast.success(`Model list refreshed for ${value.provider}.`, {
          description: `${result.models.length} model${result.models.length === 1 ? '' : 's'} · source: ${result.source}`,
        })
      },
      onError: (error: unknown) =>
        toast.error('Could not refresh the model list', {
          description: isApiError(error) ? error.message : String(error),
        }),
    })
  }

  // The parent owns `onChange` and may pass a fresh closure every render; a ref
  // keeps the reconcile effect's dependencies to the values that actually
  // decide the outcome.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // The server list is the truth across **every** catalog change — first load,
  // the all-roles re-fetch below, an admin refresh invalidating the catalog
  // key. Nothing runs before the first answer: a pending query is not an empty
  // catalog, so a selection is never cleared against an unfetched list. The
  // call is made only when the reconciled value really differs, which is what
  // keeps a correction from feeding itself.
  useEffect(() => {
    if (!catalog.data) return
    const next = reconcileSelection(catalog.data.items, value)
    if (next.provider !== value.provider || next.model !== value.model) {
      onChangeRef.current(next)
    }
  }, [catalog.data, value])

  // Public, anon-safe read — available to every role, unlike `runRefresh`.
  const runRefetch = () => {
    void catalog.refetch().then((result) => {
      if (result.isError) {
        toast.error('Could not re-fetch the provider catalog', {
          description: isApiError(result.error) ? result.error.message : String(result.error),
        })
      }
    })
  }

  if (catalog.isPending) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <span className="sr-only">Loading providers…</span>
      </div>
    )
  }

  if (catalog.isError) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <ErrorState
          error={catalog.error}
          compact
          onRetry={() => void catalog.refetch()}
        />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className={cn('rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground', className)}>
        The server published no enabled providers — no target can be chosen here, so the request
        keeps the server&apos;s own default.
      </p>
    )
  }

  const models = modelsFor(items, value.provider)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-provider`}>Provider</FieldLabel>
          <Select
            value={value.provider || undefined}
            onValueChange={pickProvider}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-provider`} className="h-10 w-full">
              <SelectValue placeholder="Select a provider…" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.catalog_id} value={item.catalog_id}>
                  {item.name || item.catalog_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-model`}>Model</FieldLabel>
          <Select
            value={value.model || undefined}
            onValueChange={(model) => onChange({ provider: value.provider, model })}
            disabled={disabled || models.length === 0}
          >
            <SelectTrigger id={`${idPrefix}-model`} className="h-10 w-full">
              <SelectValue placeholder={modelPlaceholder(value.provider, models)} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {showRefresh && (
          <div className="flex flex-wrap gap-2">
            {/* Every role: this only re-reads the public catalog. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-lg:h-10 sm:mb-0.5"
              disabled={disabled || catalog.isFetching}
              onClick={runRefetch}
              title="Re-fetch the public provider catalog (any role)"
            >
              <RefreshCw aria-hidden />
              {catalog.isFetching ? 'Re-fetching…' : 'Re-fetch catalog'}
            </Button>

            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-lg:h-10 sm:mb-0.5"
                disabled={disabled || refresh.isPending || value.provider === ''}
                onClick={runRefresh}
                title="Re-fetch this provider's model list (admin, settings:write)"
              >
                <RefreshCw aria-hidden />
                {refresh.isPending ? 'Refreshing…' : 'Refresh models'}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground">
          {value.provider
            ? 'Chosen provider and model travel in the request body; the answer reports the provider · model the server actually used.'
            : 'No provider chosen — the request goes out without an override and the server picks its own target.'}
        </p>
        {value.provider !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-lg:h-10 sm:ml-auto"
            disabled={disabled}
            onClick={() => onChange({ provider: '', model: '' })}
            title="Clear the override and let the server pick its own active provider"
          >
            Use server default
          </Button>
        )}
      </div>
    </div>
  )
}
