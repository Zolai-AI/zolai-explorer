import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Database, Search as SearchIcon, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSearch } from '../features/analyze/api'
import { Card } from '../components/Card'
import { DataTable, type Column } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { ErrorState, failureDetail } from '../components/ErrorState'
import { PageHeader } from '../components/PageHeader'
import { RawJson } from '../components/RawJson'
import { Skeleton } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Field, FieldError, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { formatScore } from '../lib/format'
import { ENDPOINTS_BY_ID, publicPath } from '../lib/endpoints'
import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_LIMIT_CHOICES,
  searchQuerySchema,
  searchSubmitDisabled,
  submitSearch,
  wordPath,
  type SearchQueryInput,
} from '../lib/forms'
import type { SearchHit } from '../lib/schemas'
import { cn } from '../lib/utils'

const LIMIT_CHOICES = SEARCH_LIMIT_CHOICES

/**
 * The versioned search endpoint, read from the registry so an empty panel names
 * the address it asked (`/api/v1/search`) rather than a hand-typed literal.
 */
const SEARCH_PATH = publicPath(ENDPOINTS_BY_ID['search.query'])

/** Split a `table:ref`-style id into a clickable source + reference pair. */
function splitId(id: string): { source: string; ref: string } {
  const separator = id.indexOf(':')
  if (separator === -1) return { source: id, ref: '' }
  return { source: id.slice(0, separator), ref: id.slice(separator + 1) }
}

function sourceTone(source: string): string {
  if (source.startsWith('bible')) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (source.startsWith('dict')) return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (source.startsWith('vocab')) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'bg-muted text-foreground'
}

export function Search() {
  const [limit, setLimit] = useState(String(DEFAULT_SEARCH_LIMIT))
  const search = useSearch()

  /**
   * `useForm` + zod validates the query before the mutation runs; the limit is
   * a `<Select>` value handed to the pure `submitSearch` handler, which clamps
   * it and returns the exact payload the API receives.
   */
  const form = useForm<SearchQueryInput>({
    resolver: zodResolver(searchQuerySchema),
    defaultValues: { query: 'pasian' },
  })

  /**
   * The submit control mirrors the field: held back while the query is
   * whitespace-only (there is nothing to POST) or a search is already in
   * flight, and re-enabled as soon as there is text to send — `watch`
   * re-renders on every keystroke, so the state cannot go stale. A disabled
   * submit button also keeps the browser's Enter-to-submit from firing an
   * empty request; with text in the field the button is enabled and Enter
   * submits exactly as before.
   */
  const submitDisabled = searchSubmitDisabled(form.watch('query'), search.isPending)

  const runSearch = (query: string, rawLimit: string) => {
    const payload = submitSearch({ query, limit: rawLimit })
    if (!payload.ok) return
    search.mutate(payload.value, {
      onError: (error: unknown) =>
        toast.error('Search failed', { description: failureDetail(error) }),
    })
  }

  const results = search.data?.results ?? []
  const grouped = results.reduce<Record<string, number>>((acc, hit) => {
    acc[hit.source] = (acc[hit.source] ?? 0) + 1
    return acc
  }, {})

  // The limit that actually produced these results comes from the mutation's
  // variables — the request that ran — not the live `<Select>`, which the reader
  // may have changed since. The response carries no limit and no total, so this
  // is the only honest number to feed the table's `serverLimit` footer.
  const requestedLimit = search.variables?.limit ?? null

  const columns: Column<SearchHit>[] = [
    {
      key: 'rank',
      header: '#',
      align: 'right',
      mono: true,
      numeric: true,
      // Displayed 1-based (rank); the row's array position stays 0-based.
      cell: (_hit, index) => <span className="text-muted-foreground tabular-nums">{index + 1}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      cell: (hit) => (
        <Badge variant="outline" className={cn('font-mono', sourceTone(hit.source))}>
          {hit.source}
        </Badge>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      mono: true,
      hideBelow: 'md',
      sortValue: (hit) => splitId(hit.id).ref,
      cell: (hit) => {
        const { ref } = splitId(hit.id)
        return ref ? (
          <span className="truncate text-primary">{ref}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      key: 'text',
      header: 'Text',
      cell: (hit) =>
        hit.text ? (
          <span className="break-words">{hit.text}</span>
        ) : (
          <span className="text-muted-foreground italic">empty text</span>
        ),
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      mono: true,
      numeric: true,
      hideBelow: 'sm',
      sortValue: (hit) => hit.score,
      cell: (hit) => formatScore(hit.score),
    },
    {
      key: 'open',
      header: 'Open',
      cell: (hit) => {
        const { ref } = splitId(hit.id)
        return (
          <Button variant="link" size="xs" className="h-auto max-lg:h-10 px-0 text-xs" asChild>
            <Link to={wordPath(ref || hit.id)}>Word explorer →</Link>
          </Button>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Corpus search"
        icon={<SearchIcon className="size-5" aria-hidden />}
        description={
          <>
            Lexical retrieval across the dictionary and Bible collections. Every hit reports its source
            table and lexical score — this is exact/substring matching, not semantic search.
          </>
        }
      />

      <Card
        title="Query"
        subtitle="POST /search"
        actions={<SlidersHorizontal className="text-muted-foreground/70" aria-hidden />}
      >
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((values) => runSearch(values.query, limit))}
        >
          {/* Mobile-first: stacked fields, side by side from `sm`. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start">
            <Field
              className="min-w-0 gap-1.5"
              data-invalid={form.formState.errors.query ? 'true' : undefined}
            >
              <FieldLabel htmlFor="search-query">Query</FieldLabel>
              <Input
                id="search-query"
                placeholder="pasian, gam, thupha…"
                autoComplete="off"
                spellCheck={false}
                {...form.register('query')}
                aria-invalid={form.formState.errors.query ? 'true' : undefined}
                className="h-10 font-mono"
              />
              <FieldError errors={[form.formState.errors.query]} />
            </Field>
            <div className="sm:w-28">
              <Label htmlFor="search-limit">Limit</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="search-limit" className="mt-1.5 h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_CHOICES.map((choice) => (
                    <SelectItem key={choice} value={String(choice)}>
                      {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={submitDisabled}
              className="h-10 sm:w-auto"
            >
              {search.isPending ? 'Searching…' : 'Run search'}
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title="Results"
        subtitle={search.data ? `Results for "${search.data.query}"` : 'POST /search'}
      >
        {search.isPending ? (
          <SearchSkeleton />
        ) : search.isError ? (
          <ErrorState error={search.error} compact />
        ) : !search.data ? (
          <Empty
            title="No search yet"
            hint={`Use Run search above to retrieve matching rows from POST ${SEARCH_PATH}.`}
          />
        ) : results.length === 0 ? (
          <Empty
            title="No matches"
            hint={`POST ${SEARCH_PATH} matched no rows for "${search.data.query}". Change the query and run it again.`}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Database className="size-3.5 text-muted-foreground/70" aria-hidden />
              {Object.entries(grouped).map(([source, count]) => (
                <Badge
                  key={source}
                  variant="outline"
                  className={cn('font-mono', sourceTone(source))}
                >
                  {source} × {count}
                </Badge>
              ))}
            </div>

            {/* The honest row count and the requested limit are rendered by the
                table footer (`rowsSummary`), never hand-spelled in the header —
                the response carries no total, so anything else would invent one. */}
            <DataTable
              columns={columns}
              rows={results}
              rowKey={(hit, index) => `${hit.id}-${index}`}
              caption="Corpus search hits with source, reference and lexical score"
              serverLimit={requestedLimit}
              rowsReach="limit"
            />

            <RawJson data={search.data} label="raw /search" />
          </div>
        )}
      </Card>
    </div>
  )
}

function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border p-3">
          <Skeleton className="mb-2 h-2.5 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-3/4" />
        </div>
      ))}
      <span className="sr-only">Searching…</span>
    </div>
  )
}
