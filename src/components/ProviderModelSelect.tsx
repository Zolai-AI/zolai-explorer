import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  defaultSelection,
  modelsFor,
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
 *   - **no hardcoded provider id or model string.** The options, the default
 *     (first row the server returned, plus its `selected_model`) and every
 *     label come from the payload; `src/lib/*` guard tests fail the build if a
 *     literal ever appears in `src/`;
 *   - the selection is **controlled** — the parent owns it and puts it in the
 *     request body, so what was chosen is what was sent;
 *   - a catalog that is loading, failed or empty says so honestly and leaves the
 *     request on the server's own default instead of guessing a target;
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
  /** Opt out of the refresh affordance entirely (the admin gate still applies). */
  showRefresh?: boolean
  disabled?: boolean
  className?: string
}) {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const catalog = useProviderCatalog()
  const refresh = useRefreshModels()
  const items = catalog.data?.items ?? []
  // Seed once per empty selection: the first server row, not a named default.
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current || catalog.isPending || catalog.isError) return
    if (value.provider !== '' || items.length === 0) {
      seeded.current = true
      return
    }
    seeded.current = true
    onChange(defaultSelection(items))
  }, [catalog.isPending, catalog.isError, items, value.provider, onChange])

  const pickProvider = (catalogId: string) => {
    const row = items.find((item) => item.catalog_id === catalogId)
    onChange({
      provider: catalogId,
      model: row ? row.selected_model || row.models[0] || '' : '',
    })
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
              <SelectValue placeholder={models.length === 0 ? 'No model list published' : 'Select a model…'} />
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

        {showRefresh && isAdmin && (
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

      <p className="text-[11px] text-muted-foreground">
        {value.provider
          ? 'Chosen provider and model travel in the request body; the answer reports the provider · model the server actually used.'
          : 'No provider chosen — the request goes out without an override and the server picks its own target.'}
      </p>
    </div>
  )
}
