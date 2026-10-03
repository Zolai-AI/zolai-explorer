import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
  GitBranch,
  Layers,
  Link2,
  Quote,
  Repeat,
  Search,
  ShieldCheck,
} from 'lucide-react'
import {
  WORD_SUB_RESOURCES,
  useWord,
  useWordCollocations,
  useWordContexts,
  useWordEvidence,
  useWordForms,
  useWordPatterns,
  type WordSubResource,
} from '../features/word/api'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorPanel, ErrorState } from '../components/ErrorState'
import { Metric } from '../components/StatTile'
import { RawJson } from '../components/RawJson'
import { SkeletonCard } from '../components/Skeleton'
import { DataTable, type Column } from '../components/DataTable'
import type { Collocation, Evidence, Pattern, WordContext, Word } from '../lib/schemas'
import { formatCount, formatScore, isNonEmptyArray, isNonEmptyRecord, percent } from '../lib/format'

const SUGGESTIONS = ['pasian', 'gam', 'tapa', 'topa', 'thupha', 'kumpipa', 'keituh', 'nung']

export function Word() {
  const params = useParams<{ word?: string }>()
  const navigate = useNavigate()
  const routeWord = params.word ?? ''
  const [input, setInput] = useState(routeWord)
  const [tab, setTab] = useState<WordSubResource>('contexts')

  useEffect(() => setInput(routeWord), [routeWord])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = input.trim().toLowerCase()
    if (clean) navigate(`/word/${encodeURIComponent(clean)}`)
  }

  const word = routeWord
  const entry = useWord(word)
  const contexts = useWordContexts(word)
  const collocations = useWordCollocations(word)
  const patterns = useWordPatterns(word)
  const evidence = useWordEvidence(word)
  const forms = useWordForms(word)

  const activeQuery = { contexts, collocations, patterns, evidence, forms }[tab]
  const activeHint = WORD_SUB_RESOURCES.find((r) => r.key === tab)?.hint ?? ''

  const isEmptyEntry =
    entry.isSuccess &&
    entry.data.frequency === 0 &&
    entry.data.sources.length === 0 &&
    entry.data.collocations.length === 0

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-50">
              <BookOpen className="size-5 text-emerald-400" aria-hidden />
              Word explorer
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              One dictionary entry plus its five live sub-resources. Sections the API leaves empty
              say so instead of rendering a broken panel.
            </p>
          </div>
          {entry.data && (
            <p className="font-mono text-sm text-slate-300">
              {entry.data.word}
              <span className="ml-2 text-xs text-slate-500">
                conf {formatScore(entry.data.confidence)}
              </span>
            </p>
          )}
        </div>

        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Zolai word, e.g. pasian"
              aria-label="Word to explore"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pr-3 pl-9 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Explore
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <Link
              key={suggestion}
              to={`/word/${suggestion}`}
              className={`rounded-md border px-2 py-0.5 font-mono text-xs transition ${
                suggestion === word
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {suggestion}
            </Link>
          ))}
        </div>
      </header>

      {!word ? (
        <Empty title="Pick a word to begin" hint="Try pasian (God), gam (earth) or topa (Lord)." />
      ) : entry.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      ) : entry.isError ? (
        <ErrorPanel error={entry.error} onRetry={() => void entry.refetch()} />
      ) : isEmptyEntry ? (
        <Empty
          title={`No entry for "${word}"`}
          hint="The live API answered 200 with all-zero counts, meaning the word is not in the lexicon yet."
        >
          <Link
            to="/search"
            className="mt-1 text-xs font-medium text-emerald-400 underline underline-offset-4"
          >
            Try corpus search instead
          </Link>
        </Empty>
      ) : (
        <>
          <WordSummary data={entry.data} />
          <RawJson data={entry.data} label="raw /word/{w}" />

          <section aria-label="Word sub-resources">
            <div
              role="tablist"
              aria-label="Word sub-resources"
              className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2"
            >
              {WORD_SUB_RESOURCES.map((resource) => (
                <button
                  key={resource.key}
                  role="tab"
                  type="button"
                  aria-selected={tab === resource.key}
                  onClick={() => setTab(resource.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === resource.key
                      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {resource.label}
                </button>
              ))}
            </div>

            <p className="mt-2 font-mono text-[11px] text-slate-600">{activeHint}</p>

            <div className="mt-3">
              {activeQuery.isPending ? (
                <SkeletonCard lines={6} title={false} />
              ) : activeQuery.isError ? (
                <ErrorState error={activeQuery.error} compact />
              ) : (
                <SubResourcePanel
                  tab={tab}
                  word={word}
                  contexts={contexts.data?.contexts ?? []}
                  collocations={collocations.data?.collocations ?? []}
                  patterns={patterns.data?.patterns ?? []}
                  evidence={evidence.data?.evidence ?? []}
                  forms={forms.data?.forms ?? []}
                />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- summary */

function WordSummary({ data }: { data: Word }) {
  // The live API reports sentence_frequency = 0 for most entries — show the gap
  // rather than implying the number is meaningful.
  const sentenceFreqUnknown = data.sentence_frequency === 0
  const morphologyEmpty = !isNonEmptyRecord(data.morphology)
  const grammarEmpty = !isNonEmptyArray(data.grammar_usage)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        title="Frequency and provenance"
        subtitle="GET /word/{w}"
        className="lg:col-span-2"
        actions={<Layers className="size-4 text-slate-600" aria-hidden />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Frequency" value={data.frequency} hint="token count" />
          <Metric label="Documents" value={data.document_frequency} hint="refs seen in" />
          <Metric
            label="Sentences"
            value={sentenceFreqUnknown ? '—' : data.sentence_frequency}
            hint={sentenceFreqUnknown ? 'not reported yet' : 'sentence count'}
          />
          <Metric label="Confidence" value={percent(data.confidence)} hint="entry-level" />
        </div>

        <TagRow label="POS" values={data.pos} emptyLabel="not tagged" tone="sky" />
        <TagRow label="Sources" values={data.sources} emptyLabel="none" tone="slate" />
      </Card>

      <div className="flex flex-col gap-4">
        <Card
          title="Morphology"
          subtitle={morphologyEmpty ? 'empty on the live API' : 'agglutinative decomposition'}
          actions={<GitBranch className="size-4 text-slate-600" aria-hidden />}
        >
          {morphologyEmpty ? (
            <Empty
              compact
              title="Not populated"
              hint="The live endpoint returns {} for morphology. Surface forms live in the Forms tab."
            />
          ) : (
            <DefinitionList
              rows={Object.entries(data.morphology).map(([key, value]) => [
                key,
                formatValue(value),
              ])}
            />
          )}
        </Card>

        <Card title="Grammar usage" subtitle="pattern hits for this word">
          {grammarEmpty ? (
            <Empty
              compact
              title="Not populated"
              hint="No grammar-pattern rows reference this word yet. See the Patterns tab."
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.grammar_usage.map((row, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-slate-300"
                >
                  {formatValue(row)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Examples"
        subtitle="definition and corpus snippets"
        className="lg:col-span-3"
        actions={<Quote className="size-4 text-slate-600" aria-hidden />}
      >
        {data.examples.length === 0 ? (
          <Empty compact title="No examples" hint="This entry has no stored snippets." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.examples.map((example, index) => (
              <li
                key={`${example}-${index}`}
                className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs leading-relaxed break-words text-slate-300"
              >
                {example}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function TagRow({
  label,
  values,
  emptyLabel,
  tone,
}: {
  label: string
  values: string[]
  emptyLabel: string
  tone: 'sky' | 'slate'
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">{label}</span>
      {values.length === 0 ? (
        <span className="text-xs text-slate-500">{emptyLabel}</span>
      ) : (
        values.map((tag) => (
          <span
            key={tag}
            className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${
              tone === 'sky'
                ? 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/20'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {tag}
          </span>
        ))
      )}
    </div>
  )
}

function DefinitionList({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) {
    return <Empty compact title="Nothing recorded" />
  }
  return (
    <dl className="space-y-1.5 text-xs">
      {rows.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 font-mono text-slate-500">{key}</dt>
          <dd className="min-w-0 break-words text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* -------------------------------------------------------- sub-resources */

function SubResourcePanel({
  tab,
  word,
  contexts,
  collocations,
  patterns,
  evidence,
  forms,
}: {
  tab: WordSubResource
  word: string
  contexts: WordContext[]
  collocations: Collocation[]
  patterns: Pattern[]
  evidence: Evidence[]
  forms: string[]
}) {
  switch (tab) {
    case 'contexts':
      return <ContextsPanel word={word} rows={contexts} />
    case 'collocations':
      return <CollocationsPanel rows={collocations} />
    case 'patterns':
      return <PatternsPanel rows={patterns} />
    case 'evidence':
      return <EvidencePanel rows={evidence} />
    case 'forms':
      return <FormsPanel word={word} forms={forms} />
  }
}

function ContextsPanel({ word, rows }: { word: string; rows: WordContext[] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No parallel contexts"
        hint={`The live API returned 0 Bible verses for "${word}". Try a high-frequency corpus word.`}
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        {rows.length} parallel EN/ZO verses. Columns come from separate translation variants.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <article
            key={`${row.ref}-${index}`}
            className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
          >
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                {row.ref}
              </span>
              <span className="font-mono text-[11px] text-slate-500">{row.source}</span>
            </header>
            <div className="grid gap-2 lg:grid-cols-3">
              <Paragraph label="EN (KJV)" text={row.en} className="text-slate-300" />
              <Paragraph label="ZO TDB77" text={row.zo_tdb77} className="text-emerald-200/90" />
              <Paragraph
                label="ZO Tedim 2010"
                text={row.zo_tedim2010}
                className="text-slate-400"
                hideBelow="lg"
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Paragraph({
  label,
  text,
  className = '',
  hideBelow,
}: {
  label: string
  text: string
  className?: string
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const hide =
    hideBelow === 'sm'
      ? 'hidden sm:block'
      : hideBelow === 'md'
        ? 'hidden md:block'
        : hideBelow === 'lg'
          ? 'hidden lg:block'
          : hideBelow === 'xl'
            ? 'hidden xl:block'
            : ''
  return (
    <div className={hide}>
      <p className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">{label}</p>
      <p
        className={`mt-0.5 text-xs leading-relaxed ${className} ${text ? '' : 'text-slate-600 italic'}`}
      >
        {text || 'not stored'}
      </p>
    </div>
  )
}

function CollocationsPanel({ rows }: { rows: Collocation[] }) {
  const columns: Column<Collocation>[] = [
    {
      key: 'word1',
      header: 'Left',
      mono: true,
      cell: (row) => <span className="text-slate-400">{row.word1}</span>,
    },
    {
      key: 'word2',
      header: 'Partner',
      mono: true,
      sortValue: (row) => row.word2,
      cell: (row) => <span className="text-slate-100">{row.word2}</span>,
    },
    {
      key: 'frequency',
      header: 'Freq',
      align: 'right',
      sortValue: (row) => row.frequency,
      cell: (row) => formatCount(row.frequency),
    },
    {
      key: 'pmi',
      header: 'PMI',
      align: 'right',
      sortValue: (row) => row.pmi,
      cell: (row) => (
        <span className={row.pmi > 0 ? 'text-emerald-300' : 'text-slate-600'}>
          {row.pmi > 0 ? formatScore(row.pmi) : '0 (not scored)'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row, index) => `${row.word1}-${row.word2}-${index}`}
      caption="Collocations with frequency and pointwise mutual information"
      empty={
        <Empty title="No collocations" hint="The live endpoint returned an empty list for this word." />
      }
    />
  )
}

function PatternsPanel({ rows }: { rows: Pattern[] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No observed patterns"
        hint="Patterns are mined from the corpus; few are confirmed for this word yet."
      />
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <article
          key={row.pattern_id || index}
          className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
        >
          <header className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-emerald-300">{row.pattern}</span>
            {row.status && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] tracking-wide text-slate-400 uppercase">
                {row.status}
              </span>
            )}
            <span className="font-mono text-[11px] text-slate-600">{row.pattern_id}</span>
            <span className="ml-auto text-[11px] text-slate-500">
              conf {row.confidence === null ? '—' : formatScore(row.confidence)}
            </span>
          </header>
          {row.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{row.description}</p>
          )}
          {row.function && (
            <p className="mt-1 text-[11px] text-slate-500">
              <span className="uppercase">function:</span> {row.function}
            </p>
          )}
          {isNonEmptyArray(row.examples) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.examples.map((example) => (
                <span
                  key={example}
                  className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-400"
                >
                  {example}
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function EvidencePanel({ rows }: { rows: Evidence[] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No evidence records"
        hint="Provenance tiers are attached when the knowledge pipeline records a source."
      />
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <article
          key={`${row.source_type}-${index}`}
          className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:flex-row sm:items-start"
        >
          <div className="flex shrink-0 gap-1.5 sm:w-40 sm:flex-col">
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300 ring-1 ring-emerald-500/20">
              tier {row.tier}
            </span>
            <span className="font-mono text-[11px] text-slate-500">{row.source_type}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed break-words text-slate-200">
              {row.text || <span className="text-slate-600 italic">no excerpt stored</span>}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3" aria-hidden />
                conf {formatScore(row.confidence)}
              </span>
              {Object.entries(row.metadata)
                .slice(0, 4)
                .map(([key, value]) => (
                  <span key={key} className="font-mono">
                    {key}={typeof value === 'object' ? '…' : String(value ?? '—')}
                  </span>
                ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function FormsPanel({ word, forms }: { word: string; forms: string[] }) {
  if (forms.length === 0) {
    return (
      <Empty
        title="No surface forms"
        hint={`GET /word/${word}/forms returned an empty list — the morphology table has no rows for this entry.`}
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Repeat className="size-3.5" aria-hidden />
        {forms.length} observed forms — select one to explore it directly.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {forms.map((form) => (
          <Link
            key={form}
            to={`/word/${encodeURIComponent(form)}`}
            className="group inline-flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 font-mono text-xs text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
          >
            {form}
            <Link2 className="size-3 text-slate-600 group-hover:text-emerald-500" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  )
}
