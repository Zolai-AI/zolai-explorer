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
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
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
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <BookOpen className="size-5 text-primary" aria-hidden />
              Word explorer
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One dictionary entry plus its five live sub-resources. Sections the API leaves empty
              say so instead of rendering a broken panel.
            </p>
          </div>
          {entry.data && (
            <p className="font-mono text-sm">
              {entry.data.word}
              <span className="ml-2 text-xs text-muted-foreground">
                conf {formatScore(entry.data.confidence)}
              </span>
            </p>
          )}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Zolai word, e.g. pasian"
              aria-label="Word to explore"
              autoComplete="off"
              spellCheck={false}
              className="h-10 pr-3 pl-9 font-mono placeholder:font-sans"
            />
          </div>
          <Button type="submit" disabled={!input.trim()} className="h-10">
            Explore
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              asChild
              variant="outline"
              size="xs"
              className={`max-lg:h-10 font-mono ${
                suggestion === word
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              <Link to={`/word/${suggestion}`}>{suggestion}</Link>
            </Button>
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
          <Button asChild variant="link" size="xs" className="mt-1 h-auto max-lg:h-10 px-0">
            <Link to="/search">Try corpus search instead</Link>
          </Button>
        </Empty>
      ) : (
        <>
          <WordSummary data={entry.data} />
          <RawJson data={entry.data} label="raw /word/{w}" />

          <Tabs value={tab} onValueChange={(value) => setTab(value as WordSubResource)}>
            <section aria-label="Word sub-resources">
              {/* Scrollable on phones rather than wrapping into 3 rows. */}
              <TabsList className="scrollbar-thin w-full justify-start overflow-x-auto">
                {WORD_SUB_RESOURCES.map((resource) => (
                  <TabsTrigger
                    key={resource.key}
                    value={resource.key}
                    className="max-lg:h-10 shrink-0"
                  >
                    {resource.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {WORD_SUB_RESOURCES.map((resource) => {
                const query = { contexts, collocations, patterns, evidence, forms }[resource.key]
                return (
                  <TabsContent key={resource.key} value={resource.key} className="mt-3">
                    <p className="font-mono text-[11px] text-muted-foreground">{resource.hint}</p>
                    <div className="mt-3">
                      {query.isPending ? (
                        <SkeletonCard lines={6} title={false} />
                      ) : query.isError ? (
                        <ErrorState error={query.error} compact />
                      ) : (
                        <SubResourcePanel
                          tab={resource.key}
                          word={word}
                          contexts={contexts.data?.contexts ?? []}
                          collocations={collocations.data?.collocations ?? []}
                          patterns={patterns.data?.patterns ?? []}
                          evidence={evidence.data?.evidence ?? []}
                          forms={forms.data?.forms ?? []}
                        />
                      )}
                    </div>
                  </TabsContent>
                )
              })}
            </section>
          </Tabs>
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
        actions={<Layers className="text-muted-foreground/70" aria-hidden />}
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
          actions={<GitBranch className="text-muted-foreground/70" aria-hidden />}
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
                  className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[11px]"
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
        actions={<Quote className="text-muted-foreground/70" aria-hidden />}
      >
        {data.examples.length === 0 ? (
          <Empty compact title="No examples" hint="This entry has no stored snippets." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.examples.map((example, index) => (
              <li
                key={`${example}-${index}`}
                className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed break-words"
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
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      {values.length === 0 ? (
        <span className="text-xs text-muted-foreground">{emptyLabel}</span>
      ) : (
        values.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className={`font-mono ${
              tone === 'sky'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                : ''
            }`}
          >
            {tag}
          </Badge>
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
          <dt className="shrink-0 font-mono text-muted-foreground">{key}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
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
      <p className="text-xs text-muted-foreground">
        {rows.length} parallel EN/ZO verses. Columns come from separate translation variants.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <article key={`${row.ref}-${index}`} className="rounded-lg border bg-muted/40 p-3">
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {row.ref}
              </Badge>
              <span className="font-mono text-[11px] text-muted-foreground">{row.source}</span>
            </header>
            <div className="grid gap-2 lg:grid-cols-3">
              <Paragraph label="EN (KJV)" text={row.en} />
              <Paragraph label="ZO TDB77" text={row.zo_tdb77} className="text-primary" />
              <Paragraph label="ZO Tedim 2010" text={row.zo_tedim2010} className="text-muted-foreground" hideBelow="lg" />
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
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={`mt-0.5 text-xs leading-relaxed ${className} ${text ? '' : 'text-muted-foreground italic'}`}>
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
      hideBelow: 'sm',
      cell: (row) => <span className="text-muted-foreground">{row.word1}</span>,
    },
    {
      key: 'word2',
      header: 'Partner',
      mono: true,
      sortValue: (row) => row.word2,
      cell: (row) => row.word2,
    },
    {
      key: 'frequency',
      header: 'Freq',
      align: 'right',
      mono: true,
      sortValue: (row) => row.frequency,
      cell: (row) => formatCount(row.frequency),
    },
    {
      key: 'pmi',
      header: 'PMI',
      align: 'right',
      mono: true,
      sortValue: (row) => row.pmi,
      cell: (row) => (
        <span className={row.pmi > 0 ? 'text-primary' : 'text-muted-foreground'}>
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
      empty={<Empty title="No collocations" hint="The live endpoint returned an empty list for this word." />}
    />
  )
}

function PatternsPanel({ rows }: { rows: Pattern[] }) {
  const columns: Column<Pattern>[] = [
    {
      key: 'pattern',
      header: 'Pattern',
      mono: true,
      sortValue: (row) => row.pattern,
      cell: (row) => (
        <span className="flex flex-col gap-1">
          <span className="text-primary">{row.pattern}</span>
          {row.description && (
            <span className="text-xs font-sans break-words whitespace-normal text-muted-foreground">
              {row.description}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (row) => row.status,
      cell: (row) =>
        row.status ? <Badge variant="secondary">{row.status}</Badge> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'function',
      header: 'Function',
      hideBelow: 'lg',
      sortValue: (row) => row.function,
      cell: (row) => row.function || <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'examples',
      header: 'Examples',
      hideBelow: 'xl',
      cell: (row) => (
        <span className="text-muted-foreground">
          {isNonEmptyArray(row.examples) ? row.examples.join(' · ') : '—'}
        </span>
      ),
    },
    {
      key: 'id',
      header: 'ID',
      mono: true,
      hideBelow: 'xl',
      cell: (row) => <span className="text-muted-foreground">{row.pattern_id}</span>,
    },
    {
      key: 'confidence',
      header: 'Conf',
      align: 'right',
      mono: true,
      sortValue: (row) => row.confidence ?? -1,
      cell: (row) => (row.confidence === null ? '—' : formatScore(row.confidence)),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row, index) => row.pattern_id || String(index)}
      caption="Observed grammar patterns for this word"
      empty={
        <Empty
          title="No observed patterns"
          hint="Patterns are mined from the corpus; few are confirmed for this word yet."
        />
      }
    />
  )
}

function EvidencePanel({ rows }: { rows: Evidence[] }) {
  const columns: Column<Evidence>[] = [
    {
      key: 'tier',
      header: 'Tier',
      mono: true,
      sortValue: (row) => row.tier,
      cell: (row) => (
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-700 dark:text-emerald-300"
        >
          tier {row.tier}
        </Badge>
      ),
    },
    {
      key: 'source_type',
      header: 'Source',
      mono: true,
      hideBelow: 'sm',
      sortValue: (row) => row.source_type,
      cell: (row) => <span className="text-muted-foreground">{row.source_type}</span>,
    },
    {
      key: 'text',
      header: 'Excerpt',
      cell: (row) =>
        row.text ? (
          <span className="whitespace-normal break-words">{row.text}</span>
        ) : (
          <span className="text-muted-foreground italic">no excerpt stored</span>
        ),
    },
    {
      key: 'metadata',
      header: 'Metadata',
      mono: true,
      hideBelow: 'lg',
      cell: (row) => (
        <span className="text-muted-foreground">
          {Object.entries(row.metadata)
            .slice(0, 4)
            .map(([key, value]) => `${key}=${typeof value === 'object' ? '…' : String(value ?? '—')}`)
            .join(' ') || '—'}
        </span>
      ),
    },
    {
      key: 'confidence',
      header: 'Conf',
      align: 'right',
      mono: true,
      sortValue: (row) => row.confidence,
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-1">
          <ShieldCheck className="size-3" aria-hidden />
          {formatScore(row.confidence)}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row, index) => `${row.source_type}-${index}`}
      caption="Tiered provenance records for this word"
      empty={
        <Empty
          title="No evidence records"
          hint="Provenance tiers are attached when the knowledge pipeline records a source."
        />
      }
    />
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
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Repeat className="size-3.5" aria-hidden />
        {forms.length} observed forms — select one to explore it directly.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {forms.map((form) => (
          <Button
            key={form}
            asChild
            variant="outline"
            size="xs"
            className="group max-lg:h-10 gap-1 font-mono"
          >
            <Link to={`/word/${encodeURIComponent(form)}`}>
              {form}
              <Link2 className="size-3 text-muted-foreground group-hover:text-primary" aria-hidden />
            </Link>
          </Button>
        ))}
      </div>
    </div>
  )
}
