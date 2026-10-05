import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Database,
  ExternalLink,
  FileCode2,
  GitCommit,
  HeartPulse,
  MessageSquareQuote,
  Scale,
  ScanText,
  ScrollText,
  Search,
  Sparkles,
} from 'lucide-react'
import { useKnowledgeVersion, useFoundationStats, useStatistics } from '../features/data/api'
import { useHealth } from '../components/HealthPill'
import { Card } from '../components/Card'
import { StatTile } from '../components/StatTile'
import { Empty } from '../components/Empty'
import { ErrorPanel } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { SkeletonGrid } from '../components/Skeleton'
import { DataTable, type Column } from '../components/DataTable'
import { CorpusChart, CurationChart, PipelineChart } from '../components/Charts'
import { Button } from '../components/ui/button'
import { DOCS_URL, METRICS_URL, REVIEW_URL } from '../lib/api'
import { maxValue, rowIndexLabel, shareLabel, zeroBasedBarPercent } from '../lib/charts'
import { formatCount, formatTimestamp, formatUptime } from '../lib/format'
import { collectionPath, pathOf, wordPath } from '../lib/routes'

/**
 * Maps the live `/knowledge/statistics` labels (which are human sentences, not
 * keys) onto tiles. Order here is the dashboard order.
 */
/**
 * `source` is the label `/knowledge/statistics` actually reports — the tile links
 * to `/data?collection={source}`, so a tap opens the Data page filtered to that
 * exact collection instead of a card that looks tappable and does nothing.
 */
const TILE_MAP: {
  match: RegExp
  label: string
  source: string
  icon: typeof Boxes
  accent?: boolean
}[] = [
  { match: /^dictionary entries$/i, label: 'Dictionary (ZO→EN)', source: 'dictionary entries', icon: BookOpen },
  { match: /^EN→ZO entries$/i, label: 'Dictionary (EN→ZO)', source: 'EN→ZO entries', icon: ScrollText },
  { match: /^Bible verses$/i, label: 'Bible verses', source: 'Bible verses', icon: BookOpen },
  { match: /^vocabulary items$/i, label: 'Vocabulary', source: 'vocabulary items', icon: Boxes },
  { match: /^phrases$/i, label: 'Phrases', source: 'phrases', icon: Scale },
  { match: /^grammar patterns$/i, label: 'Grammar patterns', source: 'grammar patterns', icon: Scale },
  { match: /^collocations$/i, label: 'Collocations', source: 'collocations', icon: Scale },
  { match: /^knowledge claims$/i, label: 'Knowledge claims', source: 'knowledge claims', icon: Database, accent: true },
  { match: /^hypotheses$/i, label: 'Hypotheses', source: 'hypotheses', icon: Sparkles, accent: true },
  { match: /^evidence$/i, label: 'Evidence records', source: 'evidence', icon: FileCode2, accent: true },
  { match: /^KG nodes$/i, label: 'KG nodes', source: 'KG nodes', icon: Database },
  { match: /^KG edges$/i, label: 'KG edges', source: 'KG edges', icon: Database },
]

const QUICK_JUMPS = [
  {
    to: wordPath('pasian'),
    title: 'Word explorer',
    body: 'Frequency, POS, collocations, Bible contexts, patterns and evidence for one entry.',
    icon: BookOpen,
  },
  {
    to: pathOf('analyze'),
    title: 'Analyze text',
    body: 'Sentence tokenisation and paragraph segmentation against the live tokenizer.',
    icon: ScanText,
  },
  {
    to: pathOf('rag'),
    title: 'RAG retrieval',
    body: 'Lexical retrieval with citations — placeholder answers, clearly labelled.',
    icon: MessageSquareQuote,
  },
  {
    to: pathOf('search'),
    title: 'Corpus search',
    body: 'Cross-corpus lexical search over the dictionary and Bible collections.',
    icon: Search,
  },
]

const EXTERNAL_LINKS = [
  {
    href: REVIEW_URL,
    label: 'Review queue',
    note: '/review/ — server-rendered HTML; /review/stats is not available',
  },
  { href: DOCS_URL, label: 'OpenAPI docs', note: '/docs — Swagger UI' },
  { href: METRICS_URL, label: 'Prometheus metrics', note: '/metrics — plain text' },
]

export function Dashboard() {
  const stats = useStatistics()
  const version = useKnowledgeVersion()
  const health = useHealth()
  const foundation = useFoundationStats()

  const tiles = useMemo(() => {
    const entries = stats.data?.stats ?? {}
    return TILE_MAP.map((spec) => {
      const match = Object.entries(entries).find(([key]) => spec.match.test(key))
      return {
        ...spec,
        // Link to the label the API reported, not to our display label.
        to: match ? collectionPath(match[0]) : undefined,
        value: match?.[1] ?? null,
      }
    })
  }, [stats.data])

  /** Every reported collection, sorted — the flat table under the tiles. */
  const allRows = useMemo(
    () =>
      Object.entries(stats.data?.stats ?? {})
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
    [stats.data],
  )

  const totalRows = useMemo(
    () => Object.values(stats.data?.stats ?? {}).reduce((sum, n) => sum + n, 0),
    [stats.data],
  )

  const barMax = useMemo(() => maxValue(allRows.map((row) => row.count)), [allRows])

  const allColumns: Column<(typeof allRows)[number]>[] = [
    {
      key: 'index',
      header: '#',
      align: 'right',
      mono: true,
      cell: (_row, index) => (
        <span className="text-muted-foreground">{rowIndexLabel(index)}</span>
      ),
    },
    {
      key: 'label',
      header: 'Collection',
      sortValue: (row) => row.label,
      cell: (row) => <span className="text-foreground">{row.label}</span>,
    },
    {
      // Zero-baseline bar with the count and the share of the total on screen;
      // visible at every width because it is the only numeric column here.
      key: 'rows',
      header: 'Rows (bar from zero)',
      align: 'right',
      mono: true,
      sortValue: (row) => row.count,
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted sm:w-16">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${zeroBasedBarPercent(row.count, barMax)}%` }}
            />
          </span>
          <span className="tabular-nums">
            {formatCount(row.count)} · {shareLabel(row.count, totalRows)}
          </span>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Zolai Core knowledge base
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Live counts from the deployed API, plus service health and the knowledge version the
            container is serving.
          </p>
        </div>
        {stats.data && (
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">{formatCount(totalRows)}</span> rows across{' '}
            <span className="tabular-nums">{Object.keys(stats.data.stats).length}</span> collections
          </p>
        )}
      </header>

      <section aria-label="Collection totals">
        {stats.isPending ? (
          <SkeletonGrid />
        ) : stats.isError ? (
          <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />
        ) : tiles.every((tile) => tile.value === null) ? (
          <Empty
            title="Statistics unavailable"
            hint="The API returned no collections. The versioned surface may require an API key."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tiles
              .filter((tile) => tile.value !== null)
              .map((tile) => (
                <StatTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value as number}
                  icon={<tile.icon className="size-4" />}
                  accent={tile.accent}
                  to={tile.to}
                  hint="Open in Data"
                />
              ))}
          </div>
        )}
      </section>

      <section aria-label="Charts">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Charts
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <CorpusChart
            stats={stats.data?.stats}
            isPending={stats.isPending}
            isError={stats.isError}
            error={stats.error}
            onRetry={() => void stats.refetch()}
          />
          <PipelineChart
            stats={stats.data?.stats}
            isPending={stats.isPending}
            isError={stats.isError}
            error={stats.error}
            onRetry={() => void stats.refetch()}
          />
          <CurationChart
            stats={foundation.data}
            isPending={foundation.isPending}
            isError={foundation.isError}
            error={foundation.error}
            onRetry={() => void foundation.refetch()}
          />
        </div>
      </section>

      <Card
        title="All collections"
        subtitle="every row the endpoint reports — including collections without a dashboard tile"
        actions={
          <Button asChild variant="outline" size="sm" className="max-lg:h-10">
            <Link to={pathOf('data')}>Grouped view</Link>
          </Button>
        }
      >
        {stats.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : stats.isError ? (
          <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />
        ) : allRows.length === 0 ? (
          <Empty title="No collections" hint="The API returned an empty stats object." />
        ) : (
          <DataTable
            columns={allColumns}
            rows={allRows}
            rowKey={(row) => row.label}
            caption="Every collection reported by /knowledge/statistics with its row count"
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Service health"
          subtitle="GET /health — public, no API key"
          actions={<HeartPulse className="text-muted-foreground/70" aria-hidden />}
        >
          {health.isPending ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : health.isError ? (
            <ErrorPanel error={health.error} onRetry={() => void health.refetch()} />
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Row label="Status">{health.data.status}</Row>
              <Row label="Uptime">{formatUptime(health.data.uptime_s)}</Row>
              <Row label="Version">{health.data.version}</Row>
              <Row label="Data root">
                <span className="font-mono text-xs">{health.data.data_root}</span>
              </Row>
            </dl>
          )}
          <div className="mt-4">
            <RawJson data={health.data} label="raw /health" />
          </div>
        </Card>

        <Card
          title="Knowledge version"
          subtitle="GET /knowledge/version"
          actions={<GitCommit className="text-muted-foreground/70" aria-hidden />}
        >
          {version.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : version.isError ? (
            <ErrorPanel error={version.error} onRetry={() => void version.refetch()} />
          ) : (
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <Row label="Version">
                <span className="font-mono">{version.data.version}</span>
              </Row>
              <Row label="Git commit">
                <span className="font-mono">{version.data.git_commit}</span>
              </Row>
              <Row label="Built at">{formatTimestamp(version.data.created_at)}</Row>
            </dl>
          )}
          <div className="mt-4">
            <RawJson data={version.data} label="raw /knowledge/version" />
          </div>
        </Card>
      </div>

      <section aria-label="Quick jump">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Jump to a workbench
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_JUMPS.map((jump) => (
            <Link
              key={jump.to}
              to={jump.to}
              className="group hover:bg-muted/60 focus-visible:ring-ring flex flex-col gap-2 rounded-xl border p-4 transition focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="flex items-center justify-between">
                <jump.icon className="size-4 text-primary" aria-hidden />
                <ArrowRight
                  className="size-3.5 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              </span>
              <span className="text-sm font-semibold">{jump.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{jump.body}</span>
            </Link>
          ))}
        </div>
      </section>

      <Card title="External API surface" subtitle="Server-rendered — opens in a new tab">
        <ul className="grid gap-2 sm:grid-cols-3">
          {EXTERNAL_LINKS.map((link) => (
            <li key={link.href}>
              <Button
                variant="outline"
                asChild
                className="h-auto max-lg:min-h-11 w-full items-start justify-start gap-2 px-3 py-2 text-left"
              >
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{link.label}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {link.note}
                    </span>
                  </span>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  )
}
