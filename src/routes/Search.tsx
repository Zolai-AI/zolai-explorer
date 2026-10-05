import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Database, Search as SearchIcon, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSearch } from '../features/analyze/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
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
import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_LIMIT_CHOICES,
  searchQuerySchema,
  submitSearch,
  wordPath,
  type SearchQueryInput,
} from '../lib/forms'
import type { SearchHit } from '../lib/schemas'
import { cn } from '../lib/utils'

const LIMIT_CHOICES = SEARCH_LIMIT_CHOICES

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

  const runSearch = (query: string, rawLimit: string) => {
    const payload = submitSearch({ query, limit: rawLimit })
    if (!payload.ok) return
    search.mutate(payload.value, {
      onError: (error: unknown) =>
        toast.error('Search failed', {
          description: error instanceof Error ? error.message : String(error),
        }),
    })
  }

  const results = search.data?.results ?? []
  const grouped = results.reduce<Record<string, number>>((acc, hit) => {
    acc[hit.source] = (acc[hit.source] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <SearchIcon className="size-5 text-primary" aria-hidden />
          Corpus search
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Lexical retrieval across the dictionary and Bible collections. Every hit reports its source
          table and lexical score — this is exact/substring matching, not semantic search.
        </p>
      </header>

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
              disabled={search.isPending}
              className="h-10 sm:w-auto"
            >
              {search.isPending ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title="Results"
        subtitle={
          search.data
            ? `${results.length} hits for "${search.data.query}" · limit ${limit}`
            : 'POST /search'
        }
      >
        {search.isPending ? (
          <SearchSkeleton />
        ) : search.isError ? (
          <ErrorState error={search.error} compact />
        ) : !search.data ? (
          <Empty
            title="No search yet"
            hint="Submit a query to retrieve matching rows from the live corpus."
          />
        ) : results.length === 0 ? (
          <Empty
            title="No matches"
            hint={`The live search returned 0 rows for "${search.data.query}".`}
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

            <ol className="flex flex-col gap-2">
              {results.map((hit, index) => (
                <HitRow key={`${hit.id}-${index}`} hit={hit} rank={index + 1} />
              ))}
            </ol>

            <RawJson data={search.data} label="raw /search" />
          </div>
        )}
      </Card>
    </div>
  )
}

function HitRow({ hit, rank }: { hit: SearchHit; rank: number }) {
  const { ref } = splitId(hit.id)
  return (
    <li className="rounded-lg border bg-muted/40 p-3">
      <header className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-muted-foreground tabular-nums">#{rank}</span>
        <Badge variant="outline" className={cn('font-mono', sourceTone(hit.source))}>
          {hit.source}
        </Badge>
        {ref && <span className="font-mono text-[11px] text-primary">{ref}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          score {formatScore(hit.score)}
        </span>
      </header>
      <p className="text-xs leading-relaxed break-words">{hit.text || <span className="text-muted-foreground italic">empty text</span>}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="link" size="xs" className="h-auto max-lg:h-10 px-0 text-xs" asChild>
          <Link to={wordPath(ref || hit.id)}>Open in word explorer →</Link>
        </Button>
        <span className="font-mono text-[10px] text-muted-foreground">id={hit.id}</span>
      </div>
    </li>
  )
}

function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border p-3">
          <Skeleton className="mb-2 h-2.5 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-3/4" />
        </div>
      ))}
      <span className="sr-only">Searching…</span>
    </div>
  )
}
