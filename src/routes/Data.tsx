import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart3, Boxes, Database, FileCode2, GitCommit, HeartPulse, RefreshCw, ScrollText } from 'lucide-react'
import { useKnowledgeVersion, useStatistics } from '../features/data/api'
import { healthLevel, useHealth } from '../components/HealthPill'
import { Card } from '../components/Card'
import { Empty } from '../components/Empty'
import { ErrorPanel } from '../components/ErrorState'
import { RawJson } from '../components/RawJson'
import { Skeleton } from '../components/Skeleton'
import { DataTable, type Column } from '../components/DataTable'
import { StatTile } from '../components/StatTile'
import { pathOf } from '../lib/routes'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { HEALTH_URL } from '../lib/api'
import { maxValue, rowIndexLabel, shareLabel, zeroBasedBarPercent } from '../lib/charts'
import { formatCount, formatTimestamp, formatUptime } from '../lib/format'
import { collectionFromSearch } from '../lib/routes'

/** Human labels the API returns, mapped to an icon + group for the Data panel. */
const GROUPS: { test: RegExp; label: string; icon: typeof Boxes }[] = [
  { test: /dictionary entries/i, label: 'Dictionary', icon: ScrollText },
  { test: /EN→ZO entries/i, label: 'Dictionary', icon: ScrollText },
  { test: /Bible verses/i, label: 'Bible', icon: ScrollText },
  { test: /vocabulary items/i, label: 'Lexicon', icon: Boxes },
  { test: /phrases/i, label: 'Patterns', icon: BarChart3 },
  { test: /grammar patterns/i, label: 'Patterns', icon: BarChart3 },
  { test: /collocations/i, label: 'Patterns', icon: BarChart3 },
  { test: /knowledge claims/i, label: 'Knowledge graph', icon: Database },
  { test: /hypotheses/i, label: 'Knowledge graph', icon: Database },
  { test: /evidence/i, label: 'Knowledge graph', icon: FileCode2 },
  { test: /^KG /i, label: 'Knowledge graph', icon: Database },
]

type Row = { label: string; count: number; group: string; icon: typeof Boxes }

export function Data() {
  const stats = useStatistics()
  const version = useKnowledgeVersion()
  const health = useHealth()

  // Dashboard collection tiles link here as `/data?collection={label}`. The
  // filter is the label the API reported, so a tile can never point at nothing.
  const [searchParams] = useSearchParams()
  const collection = collectionFromSearch(searchParams)

  const rows: Row[] = useMemo(() => {
    const entries = stats.data?.stats ?? {}
    return Object.entries(entries)
      .map(([label, count]) => {
        const spec = GROUPS.find((group) => group.test.test(label))
        return { label, count, group: spec?.label ?? 'Other', icon: spec?.icon ?? Database }
      })
      .sort((a, b) => b.count - a.count)
  }, [stats.data])

  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) map.set(row.group, (map.get(row.group) ?? 0) + row.count)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + row.count, 0), [rows])
  const groupTotal = useMemo(
    () => grouped.reduce((sum, [, value]) => sum + value, 0),
    [grouped],
  )
  const groupMax = useMemo(() => maxValue(grouped.map(([, value]) => value)), [grouped])

  // The bar axis: the largest collection, so every bar starts at zero.
  const barMax = useMemo(() => maxValue(rows.map((row) => row.count)), [rows])

  const columns: Column<Row>[] = [
    {
      key: 'index',
      header: '#',
      align: 'right',
      mono: true,
      // Zero-based on purpose: row 0 is the first row on screen, and the number
      // is the position in the table, not a server-side identifier.
      cell: (_row, index) => (
        <span className="text-muted-foreground">{rowIndexLabel(index)}</span>
      ),
    },
    {
      key: 'label',
      header: 'Collection',
      sortValue: (row) => row.label,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <row.icon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
          <span>{row.label}</span>
        </span>
      ),
    },
    {
      key: 'group',
      header: 'Group',
      hideBelow: 'sm',
      sortValue: (row) => row.group,
      cell: (row) => <Badge variant="secondary">{row.group}</Badge>,
    },
    {
      // One numeric column: the bar is scaled from zero to the largest
      // collection, and the exact count plus its share of the total rows are
      // printed beside it — so the bar never has to carry a number alone. It is
      // visible at every width, because on a phone it is the only numeric.
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
            {formatCount(row.count)} · {shareLabel(row.count, grandTotal)}
          </span>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Database className="size-5 text-primary" aria-hidden />
            Data and service
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every collection the deployed container reports, the knowledge version it is serving, and
            the health of the process behind it.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void stats.refetch()
            void version.refetch()
            void health.refetch()
          }}
          className="max-lg:h-10"
        >
          <RefreshCw aria-hidden />
          Refresh all
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total rows"
          value={grandTotal}
          icon={<Boxes className="size-4" aria-hidden />}
          accent
        />
        <StatTile label="Collections" value={rows.length} icon={<Database className="size-4" aria-hidden />} />
        <StatTile label="Groups" value={grouped.length} icon={<BarChart3 className="size-4" aria-hidden />} />
        <StatTile
          label="Health"
          value={health.isPending ? '—' : health.isError ? 'down' : healthLevel(health.data, health.error)}
          icon={<HeartPulse className="size-4" aria-hidden />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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

        <Card
          title="Service health"
          subtitle="GET /health — public, no API key"
          actions={<HeartPulse className="text-muted-foreground/70" aria-hidden />}
        >
          {health.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
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
      </div>

      <Card
        title="Collections"
        subtitle="GET /knowledge/statistics · row index starts at 0 · bars scale 0 → largest"
        actions={<span className="font-mono text-[11px] text-muted-foreground">{HEALTH_URL}</span>}
      >
        {stats.isPending ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : stats.isError ? (
          <ErrorPanel error={stats.error} onRetry={() => void stats.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="No collections reported" hint="The endpoint returned an empty stats object." />
        ) : (
          <div className="flex flex-col gap-4">
            {collection !== '' && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Showing one collection from the dashboard link:
                  <span className="font-medium text-foreground"> {collection}</span>
                </span>
                <Button asChild variant="link" size="xs" className="h-auto max-lg:h-10 px-0">
                  <Link to={pathOf('data')}>Show all collections</Link>
                </Button>
              </p>
            )}
            <DataTable
              columns={columns}
              rows={collection === '' ? rows : rows.filter((row) => row.label === collection)}
              rowKey={(row) => row.label}
              caption="Collections reported by the Zolai Core API with row counts"
              empty={
                <Empty
                  title={`No collection named "${collection}"`}
                  hint="The dashboard linked a label this payload no longer reports. Show all collections to see what is live."
                />
              }
            />
            <RawJson data={stats.data} label="raw /knowledge/statistics" />
          </div>
        )}
      </Card>

      {grouped.length > 0 && (
        <Card
          title="Group totals"
          subtitle="Rolled up from the same payload · bars start at zero, scaled to the largest group"
        >
          <ul className="flex flex-col gap-2">
            {grouped.map(([group, count], index) => (
              <li key={group} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {rowIndexLabel(index)}
                </span>
                <span className="w-28 shrink-0 truncate text-xs sm:w-36">{group}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${zeroBasedBarPercent(count, groupMax)}%` }}
                  />
                </span>
                <span className="w-32 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums sm:w-40">
                  {formatCount(count)} · {shareLabel(count, groupTotal)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
