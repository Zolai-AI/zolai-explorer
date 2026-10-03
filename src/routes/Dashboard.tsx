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
import { useKnowledgeVersion, useStatistics } from '../features/data/api'
import { useHealth } from '../components/HealthPill'
import { Card } from '../components/Card'
import { StatTile } from '../components/StatTile'
import { Empty } from '../components/Empty'
import { ErrorPanel } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { SkeletonGrid } from '../components/Skeleton'
import { DOCS_URL, METRICS_URL, REVIEW_URL } from '../lib/api'
import { formatCount, formatTimestamp, formatUptime } from '../lib/format'

/**
 * Maps the live `/knowledge/statistics` labels (which are human sentences, not
 * keys) onto tiles. Order here is the dashboard order.
 */
const TILE_MAP: { match: RegExp; label: string; icon: typeof Boxes; accent?: boolean }[] = [
  { match: /^dictionary entries$/i, label: 'Dictionary (ZO→EN)', icon: BookOpen },
  { match: /^EN→ZO entries$/i, label: 'Dictionary (EN→ZO)', icon: ScrollText },
  { match: /^Bible verses$/i, label: 'Bible verses', icon: BookOpen },
  { match: /^vocabulary items$/i, label: 'Vocabulary', icon: Boxes },
  { match: /^phrases$/i, label: 'Phrases', icon: Scale },
  { match: /^grammar patterns$/i, label: 'Grammar patterns', icon: Scale },
  { match: /^collocations$/i, label: 'Collocations', icon: Scale },
  { match: /^knowledge claims$/i, label: 'Knowledge claims', icon: Database, accent: true },
  { match: /^hypotheses$/i, label: 'Hypotheses', icon: Sparkles, accent: true },
  { match: /^evidence$/i, label: 'Evidence records', icon: FileCode2, accent: true },
  { match: /^KG nodes$/i, label: 'KG nodes', icon: Database },
  { match: /^KG edges$/i, label: 'KG edges', icon: Database },
]

const QUICK_JUMPS = [
  {
    to: '/word/pasian',
    title: 'Word explorer',
    body: 'Frequency, POS, collocations, Bible contexts, patterns and evidence for one entry.',
    icon: BookOpen,
  },
  {
    to: '/analyze',
    title: 'Analyze text',
    body: 'Sentence tokenisation and paragraph segmentation against the live tokenizer.',
    icon: ScanText,
  },
  {
    to: '/rag',
    title: 'RAG retrieval',
    body: 'Lexical retrieval with citations — placeholder answers, clearly labelled.',
    icon: MessageSquareQuote,
  },
  {
    to: '/search',
    title: 'Corpus search',
    body: 'Cross-corpus lexical search over the dictionary and Bible collections.',
    icon: Search,
  },
]

const EXTERNAL_LINKS = [
  { href: REVIEW_URL, label: 'Review workbench', note: '/review/ — server-rendered HTML' },
  { href: DOCS_URL, label: 'OpenAPI docs', note: '/docs — Swagger UI' },
  { href: METRICS_URL, label: 'Prometheus metrics', note: '/metrics — plain text' },
]

export function Dashboard() {
  const stats = useStatistics()
  const version = useKnowledgeVersion()
  const health = useHealth()

  const tiles = useMemo(() => {
    const entries = stats.data?.stats ?? {}
    return TILE_MAP.map((spec) => ({
      ...spec,
      value: Object.entries(entries).find(([key]) => spec.match.test(key))?.[1] ?? null,
    }))
  }, [stats.data])

  const unlabelled = useMemo(() => {
    const entries = stats.data?.stats ?? {}
    return Object.entries(entries).filter(
      ([key]) => !TILE_MAP.some((spec) => spec.match.test(key)),
    )
  }, [stats.data])

  const totalRows = useMemo(
    () => Object.values(stats.data?.stats ?? {}).reduce((sum, n) => sum + n, 0),
    [stats.data],
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
            Zolai Core knowledge base
          </h1>
          <p className="mt-1 max-w-prose text-sm text-slate-400">
            Live counts from the deployed API, plus service health and the knowledge version the
            container is serving.
          </p>
        </div>
        {stats.data && (
          <p className="text-xs text-slate-500">
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
                />
              ))}
          </div>
        )}

        {unlabelled.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Also reported:{' '}
            {unlabelled.map(([key, value]) => (
              <span key={key} className="mr-2 font-mono">
                {key}={formatCount(value)}
              </span>
            ))}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Service health"
          subtitle="GET /health — public, no API key"
          actions={
            <HeartPulse className="size-4 text-slate-600" aria-hidden />
          }
        >
          {health.isPending ? (
            <p className="text-sm text-slate-400">Checking…</p>
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
          actions={<GitCommit className="size-4 text-slate-600" aria-hidden />}
        >
          {version.isPending ? (
            <p className="text-sm text-slate-400">Loading…</p>
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
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-300 uppercase">
          Jump to a workbench
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_JUMPS.map((jump) => (
            <Link
              key={jump.to}
              to={jump.to}
              className="group flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-500/30 hover:bg-slate-900"
            >
              <span className="flex items-center justify-between">
                <jump.icon className="size-4 text-emerald-400" aria-hidden />
                <ArrowRight
                  className="size-3.5 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300"
                  aria-hidden
                />
              </span>
              <span className="text-sm font-semibold text-slate-100">{jump.title}</span>
              <span className="text-xs leading-relaxed text-slate-400">{jump.body}</span>
            </Link>
          ))}
        </div>
      </section>

      <Card title="External API surface" subtitle="Server-rendered — opens in a new tab">
        <ul className="grid gap-2 sm:grid-cols-3">
          {EXTERNAL_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-start gap-2 rounded-lg border border-slate-800 px-3 py-2 transition hover:border-slate-600 hover:bg-slate-800/40"
              >
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-200">{link.label}</span>
                  <span className="block truncate font-mono text-[11px] text-slate-500">
                    {link.note}
                  </span>
                </span>
              </a>
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
      <dt className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-slate-200">{children}</dd>
    </div>
  )
}
