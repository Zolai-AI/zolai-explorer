import { useMemo, type ReactNode } from 'react'
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
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { HEALTH_URL } from '../lib/api'
import { formatCount, formatTimestamp, formatUptime } from '../lib/format'

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

  const columns: Column<Row>[] = [
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
      key: 'count',
      header: 'Rows',
      align: 'right',
      mono: true,
      sortValue: (row) => row.count,
      cell: (row) => formatCount(row.count),
    },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (row) => (grandTotal === 0 ? 0 : row.count / grandTotal),
      cell: (row) => {
        const share = grandTotal === 0 ? 0 : row.count / grandTotal
        return (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(share * 100, 1)}%` }}
              />
            </span>
            <span className="tabular-nums text-muted-foreground">{(share * 100).toFixed(1)}%</span>
          </span>
        )
      },
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
        subtitle="GET /knowledge/statistics"
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
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.label}
              caption="Collections reported by the Zolai Core API with row counts"
            />
            <RawJson data={stats.data} label="raw /knowledge/statistics" />
          </div>
        )}
      </Card>

      {grouped.length > 0 && (
        <Card title="Group totals" subtitle="Rolled up from the same payload">
          <ul className="flex flex-col gap-2">
            {grouped.map(([group, count]) => {
              const total = grouped.reduce((sum, [, value]) => sum + value, 0)
              const share = total === 0 ? 0 : count / total
              return (
                <li key={group} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs sm:w-36">{group}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(share * 100, 1.5)}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums sm:w-24">
                    {formatCount(count)}
                  </span>
                </li>
              )
            })}
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
