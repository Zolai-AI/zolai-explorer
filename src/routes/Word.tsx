import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
  DEFAULT_WORD_LIMIT,
  SUB_RESOURCE_ENDPOINT,
  WORD_LIMIT_CHOICES,
  WORD_SUB_RESOURCES,
  coerceWordLimit,
  defaultWordLimit,
  useWord,
  useWordCollocations,
  useWordContexts,
  useWordEvidence,
  useWordForms,
  useWordPatterns,
  useWordRelated,
  wordLimitChoices,
  type WordSubResource,
} from '../features/word/api'
import { Card } from '../components/Card'
import { DataFreshness } from '../components/DataFreshness'
import { Empty } from '../components/Empty'
import { ErrorPanel, ErrorState } from '../components/ErrorState'
import { Notice } from '../components/Notice'
import { Metric } from '../components/StatTile'
import { RawJson } from '../components/RawJson'
import { SkeletonCard } from '../components/Skeleton'
import { DataTable, type Column } from '../components/DataTable'
import { rowsSummary } from '../lib/datatable'
import { dedupeTags } from '../lib/tags'
import { CollocationChart } from '../components/CollocationChart'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Field, FieldError, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { submitWordLookup, wordLookupSchema, wordPath, type WordLookupInput } from '../lib/forms'
import type {
  Collocation,
  Evidence,
  Pattern,
  RelatedWord,
  WordContext,
  Word,
} from '../lib/schemas'
import { formatCount, formatScore, isNonEmptyArray, isNonEmptyRecord, percent } from '../lib/format'
import { DEFAULT_WORD_TAB, pathOf, wordPanelFromSearch, wordSearch } from '../lib/routes'

const SUGGESTIONS = ['pasian', 'gam', 'tapa', 'topa', 'thupha', 'kumpipa', 'keituh', 'nung']

/**
 * Client page sizes for the sub-resource tables. These are deliberately the
 * **same numbers the server accepts as a `limit`**, and the default page is the
 * default limit, so "Rows per page" and the limit control never speak different
 * languages on first paint (issue #23 — the pager said 10 while the limit said
 * 20). Pagination still earns its keep where a tab fetches more than one page
 * (evidence defaults to 50), and `rowsSummary` then states
 * "showing 20 of 50 rows fetched (limit 50)" rather than leaving it implied.
 */
const PAGE_SIZE = DEFAULT_WORD_LIMIT
const PAGE_SIZE_OPTIONS = WORD_LIMIT_CHOICES

/**
 * What an unadorned `/word/{w}` renders: the URL only carries overrides, so
 * these are the values the page merges beneath them.
 */
const DEFAULT_LIMITS: Record<WordSubResource, number> = {
  contexts: defaultWordLimit('contexts'),
  collocations: defaultWordLimit('collocations'),
  patterns: defaultWordLimit('patterns'),
  evidence: defaultWordLimit('evidence'),
  forms: defaultWordLimit('forms'),
  related: defaultWordLimit('related'),
}

export function Word() {
  const params = useParams<{ word?: string }>()
  const navigate = useNavigate()
  const routeWord = params.word ?? ''

  /**
   * Tab and per-sub-resource `limit` live in the query string, not in state.
   * Reading them on every render makes the URL the only copy — `?tab=evidence`
   * opens that tab on a paste or reload, and nothing can drift from it.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const panel = wordPanelFromSearch(searchParams)
  const tab = panel.tab ?? DEFAULT_WORD_TAB
  const limits: Record<WordSubResource, number> = { ...DEFAULT_LIMITS, ...panel.limits }

  /**
   * The server-side `limit` is part of each query key, so a URL/control change
   * refetches from the API instead of paging an array the client already has.
   * `replace` keeps tab clicks out of the back stack — this panel is a view of
   * one page, not a sequence of navigations.
   */
  const writePanel = (next: { tab: WordSubResource; limits: Record<WordSubResource, number> }) => {
    setSearchParams(wordSearch(next), { replace: true })
  }
  const setTab = (value: WordSubResource) => writePanel({ tab: value, limits })
  const setLimit = (sub: WordSubResource, raw: string) =>
    writePanel({ tab, limits: { ...limits, [sub]: coerceWordLimit(raw, sub) } })

  /**
   * `useForm` + zod: the route is the source of truth, so the input is reset
   * whenever the URL changes (including when the palette navigates to
   * `/word/{w}`), and `submitWordLookup` is the pure handler that validates,
   * trims and lower-cases before building the path.
   */
  const form = useForm<WordLookupInput>({
    resolver: zodResolver(wordLookupSchema),
    defaultValues: { word: routeWord },
    mode: 'onSubmit',
  })

  useEffect(() => {
    form.reset({ word: routeWord })
    // `form` is stable across renders; resetting on the route word is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeWord])

  const word = routeWord
  const entry = useWord(word)
  const contexts = useWordContexts(word, limits.contexts)
  const collocations = useWordCollocations(word, limits.collocations)
  const patterns = useWordPatterns(word, limits.patterns)
  const evidence = useWordEvidence(word, limits.evidence)
  const forms = useWordForms(word, limits.forms)
  const related = useWordRelated(word, limits.related)

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
              One dictionary entry plus its six live sub-resources. Sections the API leaves empty
              say so instead of rendering a broken panel.
            </p>
            {/* Currency of the governing GET /word/{w} query — the entry that
                gates this page. The six sub-resources each have their own
                receive times, so the claim is scoped with `subject` and only
                shown once a headword exists (the entry query is disabled
                without one, so there would be nothing that ever fetched). */}
            {word.trim() !== '' && (
              <p className="mt-1 text-xs text-muted-foreground">
                <DataFreshness
                  subject="entry"
                  updatedAtMs={entry.dataUpdatedAt}
                  isFetching={entry.isFetching}
                  onRefresh={() => void entry.refetch()}
                />
              </p>
            )}
          </div>
          {entry.data && (
            <p className="font-mono text-sm">
              {entry.data.word}
              <span className="ml-2 text-xs text-muted-foreground">
                confidence {formatScore(entry.data.confidence)}
              </span>
            </p>
          )}
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            const result = submitWordLookup(values)
            if (!result.ok) {
              form.setError('word', { message: result.issues[0] ?? 'Invalid word.' })
              return
            }
            form.clearErrors('word')
            navigate(result.value.path)
          })}
        >
          <Field className="min-w-0 flex-1 gap-1.5" data-invalid={form.formState.errors.word ? 'true' : undefined}>
            <FieldLabel htmlFor="word-lookup" className="sr-only">
              Word to explore
            </FieldLabel>
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="word-lookup"
                {...form.register('word')}
                placeholder="Zolai word, e.g. pasian"
                aria-invalid={form.formState.errors.word ? 'true' : undefined}
                autoComplete="off"
                spellCheck={false}
                className="h-10 pr-3 pl-9 font-mono placeholder:font-sans"
              />
            </div>
            <FieldError errors={[form.formState.errors.word]} />
          </Field>
          <Button
            type="submit"
            className="h-10 sm:mt-0"
            disabled={form.formState.isSubmitting}
          >
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
              <Link to={wordPath(suggestion)}>{suggestion}</Link>
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
            <Link to={pathOf('search')}>Try corpus search instead</Link>
          </Button>
        </Empty>
      ) : (
        <>
          <WordSummary data={entry.data} />
          <RawJson data={entry.data} label="raw /word/{w}" />

          {/* Persistent, not a toast: the URL still asks for a value the server
              (or the control) would not accept, so the difference stays on
              screen for as long as that URL does. */}
          {panel.clamped.length > 0 && (
            <Notice tone="warning" className="text-xs">
              {panel.clamped.map((clamp, index) => (
                <span key={`${clamp.sub}-${index}`} className="block">
                  ?limit_{clamp.sub}={clamp.requested}{' '}
                  {clamp.reason === 'cap' ? 'exceeds the server cap' : 'is not an offered size'};
                  showing {clamp.applied}.
                </span>
              ))}
            </Notice>
          )}

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
                const query = {
                  contexts,
                  collocations,
                  patterns,
                  evidence,
                  forms,
                  related,
                }[resource.key]
                return (
                  <TabsContent key={resource.key} value={resource.key} className="mt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {resource.hint} · {SUB_RESOURCE_ENDPOINT[resource.key]}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Rows per request</span>
                        <Select
                          value={String(limits[resource.key])}
                          onValueChange={(value) => setLimit(resource.key, value)}
                        >
                          <SelectTrigger size="sm" aria-label="Rows per request">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {wordLimitChoices(resource.key).map((choice) => (
                              <SelectItem key={choice} value={String(choice)}>
                                {choice}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3">
                      {query.isPending ? (
                        <SkeletonCard lines={6} title={false} />
                      ) : query.isError ? (
                        <ErrorState error={query.error} compact />
                      ) : (
                        <SubResourcePanel
                          tab={resource.key}
                          word={word}
                          limit={limits[resource.key]}
                          contexts={contexts.data?.contexts ?? []}
                          collocations={collocations.data?.collocations ?? []}
                          patterns={patterns.data?.patterns ?? []}
                          evidence={evidence.data?.evidence ?? []}
                          forms={forms.data?.forms ?? []}
                          related={related.data?.related ?? []}
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
  // A 0 from `sentence_frequency` cannot be told apart from "not counted" —
  // the endpoint reported 0 for every entry when this tile was written — so it
  // renders as `—`, and the hint claims only what this one response says.
  const sentenceFreqUnknown = data.sentence_frequency === 0
  // `morphology` is parsed through the tolerant `record` schema (`.catch({})`),
  // so a *missing* field and a present-but-`{}` one both arrive as `{}` here.
  // The card therefore says only what this response supports — "no morphology
  // for this entry" — and never which of the two the server sent.
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
          <Metric
            label="Frequency"
            value={data.frequency}
            hint={`from the dictionary entry on GET /word/${data.word}`}
          />
          <Metric label="Documents" value={data.document_frequency} hint="documents containing it" />
          <Metric
            label="Sentences"
            value={sentenceFreqUnknown ? '—' : data.sentence_frequency}
            hint={
              sentenceFreqUnknown
                ? `GET /word/${data.word} reports 0 for this entry`
                : 'sentence count'
            }
          />
          <Metric
            label="Confidence"
            value={percent(data.confidence)}
            hint="tier-weighted evidence score"
          />
        </div>

        <TagRow label="POS" values={data.pos} emptyLabel="not tagged" tone="sky" />
        <TagRow label="Sources" values={data.sources} emptyLabel="none" tone="slate" />
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card
          title="Morphology"
          subtitle={morphologyEmpty ? 'empty in this response' : 'agglutinative decomposition'}
          actions={<GitBranch className="text-muted-foreground/70" aria-hidden />}
        >
          {morphologyEmpty ? (
            <Empty
              compact
              title="Not populated"
              hint={`GET /word/${data.word} returns no morphology for this entry — the Forms tab reads its own endpoint for surface forms.`}
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

        <Card title="Grammar usage" subtitle="GET /word/{w}">
          {grammarEmpty ? (
            <Empty
              compact
              title="Not populated"
              hint={`GET /word/${data.word} returns no grammar usage for this entry — the Patterns tab reads its own endpoint.`}
            />
          ) : (
            <GrammarUsageList rows={data.grammar_usage} />
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

/**
 * `grammar_usage` on `GET /word/{w}` is a list of learned pattern records
 * (`pattern_id`, `pattern`, `function`, `description`, `confidence`, `status`,
 * `examples`), not opaque strings. Rendering each row as `JSON.stringify` put a
 * ~400px unbreakable blob in a 198px card: it clipped on desktop and, because
 * an unbreakable string sets the grid track's min-content, it dragged the whole
 * summary grid ~400px past a 390px phone. The row below reads the fields the
 * payload actually carries, and `overflow-wrap: anywhere` — unlike
 * `break-words` — shrinks that min-content, so an id with no spaces wraps
 * instead of stretching the page. A record outside this shape still shows
 * itself, as wrapped text.
 */
export function GrammarUsageList({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-2">
      {rows.map((row, index) => {
        const patternId = asText(row.pattern_id)
        const pattern = asText(row.pattern)
        const fn = asText(row.function)
        const status = asText(row.status)
        const description = asText(row.description)
        const confidence = typeof row.confidence === 'number' ? row.confidence : null
        const refs = exampleRefs(row.examples)
        // Two refs identify the pattern; the rest are counted, not dropped
        // silently, and a wiki ref keeps only its file part — the full path is
        // four lines tall on a phone and says nothing more than the filename.
        const shownRefs = refs.slice(0, 2)
        const hiddenRefs = refs.length - shownRefs.length
        const known = pattern !== '' || patternId !== '' || description !== ''
        return (
          <li
            key={patternId !== '' ? patternId : index}
            className="min-w-0 rounded-lg border bg-muted/40 px-3 py-2"
          >
            {known ? (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 font-mono text-xs font-medium [overflow-wrap:anywhere]">
                    {pattern !== '' ? pattern : `pattern ${patternId}`}
                  </span>
                  {fn !== '' && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {fn.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {status !== '' && (
                    <Badge variant="secondary" className="text-[10px] tracking-wide uppercase">
                      {status}
                    </Badge>
                  )}
                  {confidence !== null && (
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      confidence {percent(confidence)}
                    </span>
                  )}
                </div>
                {description !== '' && (
                  <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {description}
                  </p>
                )}
                {refs.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    examples:{' '}
                    <span className="font-mono [overflow-wrap:anywhere]">
                      {shownRefs.map(shortRef).join(' · ')}
                      {hiddenRefs > 0 ? ` · +${hiddenRefs} more` : ''}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="font-mono text-[11px] [overflow-wrap:anywhere]">{formatValue(row)}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The `ref` of each example (`DAN 9:17`), or `zolai-wiki/…/file.md#p1`. */
function exampleRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((example) =>
      example !== null && typeof example === 'object'
        ? asText((example as Record<string, unknown>).ref)
        : '',
    )
    .filter((ref) => ref !== '')
}

/** `zolai-wiki/grammar/file.md#p10.1` → `…/file.md#p10.1`. */
function shortRef(ref: string): string {
  const slash = ref.lastIndexOf('/')
  return slash === -1 ? ref : `…/${ref.slice(slash + 1)}`
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
  // `GET /word/{w}` sends `pos: ['Noun', 'NOUN']` for one part of speech, and
  // two chips read as two facts. Dedupe on the **value**, not the label, so the
  // empty check below still describes what is actually on screen.
  const tags = dedupeTags(values)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      {tags.length === 0 ? (
        <span className="text-xs text-muted-foreground">{emptyLabel}</span>
      ) : (
        tags.map((tag) => (
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
  limit,
  contexts,
  collocations,
  patterns,
  evidence,
  forms,
  related,
}: {
  tab: WordSubResource
  word: string
  limit: number
  contexts: WordContext[]
  collocations: Collocation[]
  patterns: Pattern[]
  evidence: Evidence[]
  forms: string[]
  related: RelatedWord[]
}) {
  switch (tab) {
    case 'contexts':
      return <ContextsPanel word={word} rows={contexts} limit={limit} />
    case 'collocations':
      return <CollocationsPanel rows={collocations} limit={limit} />
    case 'patterns':
      return <PatternsPanel rows={patterns} limit={limit} />
    case 'evidence':
      return <EvidencePanel rows={evidence} limit={limit} />
    case 'forms':
      return <FormsPanel word={word} forms={forms} limit={limit} />
    case 'related':
      return <RelatedPanel rows={related} limit={limit} />
    default: {
      const _exhaustive: never = tab
      void _exhaustive
      return null
    }
  }
}

/**
 * The parallel-contexts card list. Exported so the node-env spec can render it
 * through `renderToStaticMarkup` and prove every translation variant the payload
 * carries reaches the markup at every width (candidate #9) — the panel is plain
 * props, no router, no queries.
 */
export function ContextsPanel({
  word,
  rows,
  limit,
}: {
  word: string
  rows: WordContext[]
  limit: number
}) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No parallel contexts"
        hint={`The live API returned 0 Bible verses for "${word}". Try a high-frequency corpus word.`}
      />
    )
  }
  const summary = rowsSummary(rows.length, limit, rows.length, 'limit')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {rows.length} parallel EN/ZO verse{rows.length === 1 ? '' : 's'} (limit {limit}) from
        separate translation variants.
        {summary.truncated && ` ${summary.notice}`}
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
            {/* All three variants, at every width. Below `lg` the grid is already
                one stacked column, so a `hideBelow` here would buy no layout and
                only drop a variant the payload carries — and this card is not a
                `DataTable` column, so no footer marker would announce it. A
                variant the response leaves empty says so in its own cell. */}
            <div className="grid gap-2 lg:grid-cols-3">
              <Paragraph label="EN (KJV)" text={row.en} />
              <Paragraph label="ZO TDB77" text={row.zo_tdb77} className="text-primary" />
              <Paragraph label="ZO Tedim 2010" text={row.zo_tedim2010} className="text-muted-foreground" />
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
}: {
  label: string
  text: string
  className?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={`mt-0.5 text-xs leading-relaxed ${className} ${text ? '' : 'text-muted-foreground italic'}`}>
        {text || 'not stored'}
      </p>
    </div>
  )
}

function CollocationsPanel({ rows, limit }: { rows: Collocation[]; limit: number }) {
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
    <div className="flex flex-col gap-4">
      <CollocationChart rows={rows} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row, index) => `${row.word1}-${row.word2}-${index}`}
        caption="Collocations with frequency and pointwise mutual information"
        empty={<Empty title="No collocations" hint="The live endpoint returned an empty list for this word." />}
        pageSize={PAGE_SIZE}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        serverLimit={limit}
        rowsReach="limit"
        columnVisibility
      />
    </div>
  )
}

function PatternsPanel({ rows, limit }: { rows: Pattern[]; limit: number }) {
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
      header: 'Confidence',
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
      pageSize={PAGE_SIZE}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      serverLimit={limit}
      rowsReach="limit"
      empty={
        <Empty
          title="No observed patterns"
          hint="Patterns are mined from the corpus; few are confirmed for this word yet."
        />
      }
    />
  )
}

/** How many `metadata` keys the Evidence cell has room for. */
const METADATA_KEY_LIMIT = 4

/**
 * The metadata cell shows the first `keyLimit` pairs, then **says how many it
 * left out**. A silent cut let a dictionary-side number and a corpus-side number
 * appear to disagree with nothing on screen to explain the gap, so the marker is
 * counted from the real object rather than estimated. It is plain text, not a
 * fake affordance — this page has no working expander for a table cell, and a
 * native `title` is banned for recoverable content (WCAG 1.4.13).
 */
export function metadataPreview(
  metadata: Record<string, unknown>,
  keyLimit = METADATA_KEY_LIMIT,
): string {
  const entries = Object.entries(metadata)
  const pairs = entries
    .slice(0, keyLimit)
    .map(([key, value]) => {
      // `typeof null === 'object'`, so a null has to be tested before the
      // nested-value marker — an absent value is this project's `—`, not a
      // structure the cell collapsed.
      const shown =
        value === null || value === undefined
          ? '—'
          : typeof value === 'object'
            ? '…'
            : String(value)
      return `${key}=${shown}`
    })
    .join(' ')
  const hidden = Math.max(0, entries.length - keyLimit)
  return `${pairs || '—'}${hidden > 0 ? ` +${hidden} more` : ''}`
}

function EvidencePanel({ rows, limit }: { rows: Evidence[]; limit: number }) {
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
        <span className="text-muted-foreground">{metadataPreview(row.metadata)}</span>
      ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
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
      pageSize={PAGE_SIZE}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      serverLimit={limit}
      rowsReach="limit"
      columnVisibility
      empty={
        <Empty
          title="No evidence records"
          hint="Provenance tiers are attached when the knowledge pipeline records a source."
        />
      }
    />
  )
}

function FormsPanel({
  word,
  forms,
  limit,
}: {
  word: string
  forms: string[]
  limit: number
}) {
  if (forms.length === 0) {
    return (
      <Empty
        title="Not populated"
        hint={`GET /word/${word}/forms returned an empty list — the morphology table has no rows for this entry yet. This is an upstream gap, not a failed request.`}
      />
    )
  }
  const formsSummary = rowsSummary(forms.length, limit, forms.length, 'limit')
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Repeat className="size-3.5" aria-hidden />
        {forms.length} observed form{forms.length === 1 ? '' : 's'} (limit {limit}) — select one to
        explore it directly.
        {formsSummary.truncated && ` ${formsSummary.notice}`}
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
            <Link to={wordPath(form)}>
              {form}
              <Link2 className="size-3 text-muted-foreground group-hover:text-primary" aria-hidden />
            </Link>
          </Button>
        ))}
      </div>
    </div>
  )
}

function RelatedPanel({ rows, limit }: { rows: RelatedWord[]; limit: number }) {
  const columns: Column<RelatedWord>[] = [
    {
      key: 'word',
      header: 'Word',
      mono: true,
      sortValue: (row) => row.word,
      cell: (row) => (
        <Link to={wordPath(row.word)} className="text-primary underline-offset-2 hover:underline">
          {row.word}
        </Link>
      ),
    },
    {
      key: 'relation',
      header: 'Relation',
      mono: true,
      sortValue: (row) => row.relation,
      cell: (row) => <Badge variant="secondary">{row.relation}</Badge>,
    },
    {
      key: 'pos',
      header: 'POS',
      hideBelow: 'sm',
      sortValue: (row) => row.pos ?? '',
      cell: (row) => row.pos ?? '—',
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
      key: 'shared_prefix',
      header: 'Prefix',
      align: 'right',
      mono: true,
      hideBelow: 'md',
      sortValue: (row) => row.shared_prefix,
      cell: (row) => formatCount(row.shared_prefix),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row, index) => `${row.word}-${row.relation}-${index}`}
      caption="Related words — same family first, then same-POS neighbours"
      pageSize={PAGE_SIZE}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      serverLimit={limit}
      rowsReach="limit"
      columnVisibility
      empty={
        <Empty
          title="No related words"
          hint="The live endpoint returned an empty related list for this headword."
        />
      }
    />
  )
}
