import { useState, type FormEvent } from 'react'
import { Database, Search as SearchIcon, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSearch } from '../features/analyze/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { formatScore } from '../lib/format'
import type { SearchHit } from '../lib/schemas'

const LIMIT_CHOICES = [5, 10, 25, 50]

/** Split a `table:ref`-style id into a clickable source + reference pair. */
function splitId(id: string): { source: string; ref: string } {
  const separator = id.indexOf(':')
  if (separator === -1) return { source: id, ref: '' }
  return { source: id.slice(0, separator), ref: id.slice(separator + 1) }
}

function sourceTone(source: string): string {
  if (source.startsWith('bible')) return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
  if (source.startsWith('dict')) return 'bg-sky-500/10 text-sky-300 ring-sky-500/20'
  if (source.startsWith('vocab')) return 'bg-amber-500/10 text-amber-300 ring-amber-500/20'
  return 'bg-slate-800 text-slate-300 ring-slate-700'
}

export function Search() {
  const [query, setQuery] = useState('pasian')
  const [limit, setLimit] = useState(10)
  const search = useSearch()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = query.trim()
    if (clean) search.mutate({ query: clean, limit })
  }

  const results = search.data?.results ?? []
  const grouped = results.reduce<Record<string, number>>((acc, hit) => {
    acc[hit.source] = (acc[hit.source] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-50">
          <SearchIcon className="size-5 text-emerald-400" aria-hidden />
          Corpus search
        </h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          Lexical retrieval across the dictionary and Bible collections. Every hit reports its source
          table and lexical score — this is exact/substring matching, not semantic search.
        </p>
      </header>

      <Card
        title="Query"
        subtitle="POST /search"
        actions={
          <SlidersHorizontal className="size-4 text-slate-600" aria-hidden />
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="search-query" className="block text-xs font-medium text-slate-300">
                Query
              </label>
              <input
                id="search-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="pasian, gam, thupha…"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="search-limit" className="block text-xs font-medium text-slate-300">
                Limit
              </label>
              <select
                id="search-limit"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="mt-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {LIMIT_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!query.trim() || search.isPending}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {search.isPending ? 'Searching…' : 'Search'}
            </button>
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
              <Database className="size-3.5 text-slate-600" aria-hidden />
              {Object.entries(grouped).map(([source, count]) => (
                <span
                  key={source}
                  className={`rounded-md px-2 py-0.5 font-mono text-[11px] ring-1 ${sourceTone(source)}`}
                >
                  {source} × {count}
                </span>
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
    <li className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <header className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-slate-600 tabular-nums">#{rank}</span>
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ${sourceTone(hit.source)}`}
        >
          {hit.source}
        </span>
        {ref && (
          <span className="font-mono text-[11px] text-emerald-300">{ref}</span>
        )}
        <span className="ml-auto text-[11px] text-slate-500 tabular-nums">
          score {formatScore(hit.score)}
        </span>
      </header>
      <p className="text-xs leading-relaxed break-words text-slate-200">
        {hit.text || <span className="text-slate-600 italic">empty text</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          to={`/word/${encodeURIComponent(ref || hit.id)}`}
          className="text-[11px] font-medium text-emerald-400 underline underline-offset-4 transition hover:text-emerald-300"
        >
          Open in word explorer →
        </Link>
        <span className="font-mono text-[10px] text-slate-600">id={hit.id}</span>
      </div>
    </li>
  )
}

function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-slate-800 p-3">
          <div className="mb-2 h-2.5 w-32 rounded bg-slate-800" />
          <div className="h-3 w-full rounded bg-slate-800" />
          <div className="mt-1.5 h-3 w-3/4 rounded bg-slate-800" />
        </div>
      ))}
      <span className="sr-only">Searching…</span>
    </div>
  )
}