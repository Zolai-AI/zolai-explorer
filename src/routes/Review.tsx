import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Edit, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import {
  RECORDS_WHITELIST,
  EDITOR_ONLY_TABLES,
  useListRecords,
  useListAudit,
  useCorrectRecord,
  type TableName,
  type AuditItem,
} from '../features/review/api'
import { Card } from '../components/Card'
import { DataTable, type Column } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { ErrorState, failureDetail } from '../components/ErrorState'
import { FilterChips, type FilterChip } from '../components/FilterChips'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { TruncatedValue } from '../components/TruncatedValue'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Field, FieldError, FieldLabel } from '../components/ui/field'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { can, useRole } from '../lib/auth'
import { formatCount } from '../lib/format'
import type { HideBelow } from '../lib/datatable'
import {
  DEFAULT_REVIEW_TAB,
  DEFAULT_REVIEW_TABLE,
  reviewPanelFromSearch,
  reviewSearch,
  type ReviewTab,
} from '../lib/routes'
import { cn } from '../lib/utils'

/**
 * The whitelist is the server's, imported from the transport rather than
 * re-typed here — a second list is a second truth, and `recordsRouter`
 * 400s on anything it does not know.
 */
const WHITELISTED_TABLES = RECORDS_WHITELIST

type RecordRow = Record<string, unknown> & { id: number }

const PAGE_SIZE = 50

/** The audit tail is fetched, not paged — this page offers no cursor for it. */
const AUDIT_LIMIT = 50

/** Preview widths before the disclosure appears: JSON is denser than prose. */
const OBJECT_CELL_LIMIT = 80
const SCALAR_CELL_LIMIT = 120

/** The shared `hideBelow` tiers, ordered smallest → largest breakpoint. */
const RECORDS_HIDE_TIERS: readonly HideBelow[] = ['sm', 'md', 'lg', 'xl']

/**
 * Which responsive tier a records column earns, by how critical it is to triaging
 * the queue. The columns come straight off the row (`columnKeys`), so priority is
 * positional: the **first** data column is what an operator scans to identify a
 * row (headword, gloss) and survives at every width; each later column drops one
 * tier earlier, capped at `xl` past the fourth.
 *
 * This replaces the single `md` cliff that hid every column but the first at the
 * same breakpoint (candidate #13) — the audit table beside it already graded
 * `sm`/`md`/`lg`/`xl`, and a graded ladder keeps the highest-value columns on
 * screen at 375px instead of shipping them all over one edge. The columns still
 * off-screen are announced by `DataTable`'s `hiddenColumnsAt` footer — the queue
 * must not render its own marker on top of that.
 */
export function recordsColumnTier(index: number): HideBelow | undefined {
  if (index <= 0) return undefined
  return RECORDS_HIDE_TIERS[Math.min(index - 1, RECORDS_HIDE_TIERS.length - 1)]
}

/**
 * What each tab is called in the chip row. The URL holds the short closed-set
 * key (`?tab=audit`); the chip says it in the words the tab trigger uses, so
 * the applied state and the control that changed it read the same way.
 */
const TAB_LABELS: Record<ReviewTab, string> = {
  browse: 'Browse',
  audit: 'Audit log',
}

/**
 * How each panel words its own count. Browse pages by cursor, so a page is
 * exactly the rows this request returned; the audit tail is a fetch, not a page.
 */
const COUNT_UNITS: Record<ReviewTab, string> = {
  browse: 'rows on this page',
  audit: 'audit entries fetched',
}

export function Review() {
  const role = useRole()
  const isAdmin = can(role, 'admin')

  /**
   * Tab, table and text filter live in the query string, not in state. Reading
   * them on every render makes the URL the only copy — `?tab=audit&table=phrases`
   * opens that view on a paste or a reload, and nothing can drift from it.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const panel = reviewPanelFromSearch(searchParams)
  const activeTab = panel.tab ?? DEFAULT_REVIEW_TAB
  const selectedTable = panel.table ?? DEFAULT_REVIEW_TABLE
  const searchQuery = panel.q

  /**
   * Every write goes through the codec, so the grammar (defaults omitted, one
   * parameter per fact, `q` escaped by `URLSearchParams`) exists in exactly one
   * place. `replace` keeps tab clicks out of the back stack — this is one page
   * being re-filtered, not a sequence of navigations.
   */
  const writePanel = useCallback(
    (next: { tab: ReviewTab; table: TableName; q: string }) => {
      setSearchParams(reviewSearch(next), { replace: true })
    },
    [setSearchParams],
  )
  const setActiveTab = (tab: ReviewTab) =>
    writePanel({ tab, table: selectedTable, q: searchQuery })
  const setSelectedTable = (table: TableName) =>
    writePanel({ tab: activeTab, table, q: searchQuery })
  const setSearchQuery = (q: string) => writePanel({ tab: activeTab, table: selectedTable, q })

  /**
   * The cursor stack is **deliberately not in the URL** — everything else on
   * this page is shareable, this is not. The server's `cursor` is an **opaque id
   * of the last item seen** (`WHERE id > ?`) into live rows, so a pasted stack
   * is stale the moment the queue moves: it would drop a colleague on page 4 of
   * a result set that no longer exists, or on a row that has since been
   * corrected. The filter is the link; the walk through it is not.
   *
   * Nor can it be stepped backwards arithmetically — the old Previous button did
   * `parseInt(cursor) - 50` and, because the cursor was never even sent, "Next"
   * re-fetched page 1 while "Previous" jumped to a row id that happened to land
   * mid-list. Paging is therefore a **stack**: each advance pushes the cursor it
   * came from, so Back returns to exactly the page the user was on.
   */
  const [cursorStack, setCursorStack] = useState<number[]>([])
  const cursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined
  const [selectedRow, setSelectedRow] = useState<RecordRow | null>(null)
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false)
  const [correctionFields, setCorrectionFields] = useState<Record<string, string>>({})
  const [correctionReason, setCorrectionReason] = useState('')

  // Browse records
  const records = useListRecords({
    table: selectedTable,
    q: searchQuery || undefined,
    limit: PAGE_SIZE,
    cursor,
  })

  // Audit log
  const audit = useListAudit({
    table: activeTab === 'audit' ? selectedTable : undefined,
    limit: AUDIT_LIMIT,
  })

  // Correct record mutation
  const correct = useCorrectRecord()

  // Load columns for the selected table when a row is selected
  const [rowColumns, setRowColumns] = useState<string[]>([])
  useEffect(() => {
    if (selectedRow) {
      setRowColumns(Object.keys(selectedRow).filter((k) => k !== 'id'))
    }
  }, [selectedRow])

  // A cursor is scoped to one table + filter, so both changes start at page one.
  useEffect(() => {
    setCursorStack([])
  }, [selectedTable, searchQuery])

  /**
   * The row/entry count of the panel actually being looked at, taken from that
   * panel's own payload. While a request is in flight the payload is *absent*,
   * which is not the same as zero rows — so the chip is missing rather than
   * saying `0`.
   */
  const counted =
    activeTab === 'audit' ? audit.data?.items.length : records.data?.items.length
  const countChip: FilterChip | undefined =
    counted === undefined
      ? undefined
      : {
          id: 'count',
          label: 'Showing',
          value: `${formatCount(counted)} ${COUNT_UNITS[activeTab]}`,
        }

  /**
   * The applied state, as chips instead of as prose in the heading.
   *
   * A ✕ appears only where this page has a control that can actually undo the
   * filter: the tab and the table both have selectors above/beside them, and the
   * filter box clears back to empty. At its default a filter has nothing to
   * remove — `Table: dictionary` is a badge stating which table the request named
   * (`records.list` requires one), not an action.
   */
  const chips: FilterChip[] = [
    ...(activeTab === DEFAULT_REVIEW_TAB
      ? []
      : [
          {
            id: 'tab',
            label: 'View',
            value: TAB_LABELS[activeTab],
            onRemove: () => setActiveTab(DEFAULT_REVIEW_TAB),
          },
        ]),
    {
      id: 'table',
      label: 'Table',
      value: selectedTable,
      ...(selectedTable === DEFAULT_REVIEW_TABLE
        ? {}
        : { onRemove: () => setSelectedTable(DEFAULT_REVIEW_TABLE) }),
    },
    ...(searchQuery.trim() === ''
      ? []
      : [
          {
            id: 'q',
            label: 'Filter',
            value: searchQuery,
            onRemove: () => setSearchQuery(''),
          },
        ]),
    // The count is a *badge*, never an action. And it stays honest: `/review/stats`
    // does not exist on the versioned API and this queue is cursor-paginated with
    // no server total, so there is no "of N rows" here and no total the chip could
    // imply — it names only what the payload returned.
    ...(countChip ? [countChip] : []),
  ]

  // "Clear all" drops every deviation back to the page's own defaults. The table
  // goes to `DEFAULT_REVIEW_TABLE` rather than to nothing, because a request with
  // no `table` is one the API would refuse.
  const clearAll = () =>
    writePanel({ tab: DEFAULT_REVIEW_TAB, table: DEFAULT_REVIEW_TABLE, q: '' })

  const openCorrectionDialog = useCallback((row: RecordRow) => {
    setSelectedRow(row)
    setCorrectionFields({})
    setCorrectionReason('')
    setCorrectionDialogOpen(true)
  }, [])

  const handleCorrect = useCallback(() => {
    if (!selectedRow) return
    if (Object.keys(correctionFields).length === 0) {
      toast.error('No changes', { description: 'Add at least one field to correct.' })
      return
    }
    if (!correctionReason.trim()) {
      toast.error('Reason required', { description: 'Enter a reason for this correction.' })
      return
    }
    correct.mutate(
      { table: selectedTable, rowId: selectedRow.id, corrected_fields: correctionFields, reason: correctionReason },
      {
        onSuccess: () => {
          toast.success('Correction applied', { description: 'Row updated and audit logged.' })
          setCorrectionDialogOpen(false)
          records.refetch()
          audit.refetch()
        },
        onError: (error: unknown) =>
          toast.error('Correction failed', { description: failureDetail(error) }),
      },
    )
  }, [selectedRow, selectedTable, correctionFields, correctionReason, correct, records, audit])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Review Queue"
        icon={<FileText className="size-5" aria-hidden />}
        description={
          <>
            Browse whitelisted tables, inspect audit history, and submit field corrections. Corrections
            are audited in <code className="px-1 bg-muted">data_audit_log</code>; the{' '}
            <code className="px-1 bg-muted">review_status</code> column is set to{' '}
            <code className="px-1 bg-muted">reviewed</code> on lexicon tables where it exists.
          </>
        }
        actions={
          isAdmin ? <Badge variant="outline">Admin: dataset:edit scope</Badge> : undefined
        }
      />

      {/* The applied state, as chips over the panel they govern — never as prose
          in the heading. The heading says what this page *is*; these say what you
          asked it for, and the ✕ on each is the same control the selector beside
          it already offers. The request path a chip replaced (`GET /records?table=…`)
          did not disappear: it lives on the panel's own `subtitle` below, which is
          where a request path belongs. */}
      <FilterChips chips={chips} onClearAll={clearAll} />

      {/* shadcn Tabs: keyboard arrow navigation, roving focus and the
          `aria-selected` wiring that the hand-rolled `role="tablist"` + plain
          `<button>` pair never provided — a screen reader announced two buttons,
          not a tab set. Corrections are a dialog opened from a row action, not a
          tab: a tab with no selection is an empty shell, so the only two tabs here
          are the ones the user can actually reach.

          The trigger labels are `TAB_LABELS`, the same map the chip row reads, so
          the tab a person clicks and the filter chip that names it can never
          disagree. The first trigger is `DEFAULT_REVIEW_TAB` — the value the URL
          omits, spelled from one place. */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReviewTab)}>
        <TabsList>
          <TabsTrigger value={DEFAULT_REVIEW_TAB} className="max-lg:h-10">
            <FileText aria-hidden />
            {TAB_LABELS.browse}
          </TabsTrigger>
          <TabsTrigger value="audit" className="max-lg:h-10">
            <ScrollText aria-hidden />
            {TAB_LABELS.audit}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={DEFAULT_REVIEW_TAB}>
          <RecordBrowser
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            cursorStack={cursorStack}
            setCursorStack={setCursorStack}
            records={records}
            onOpenCorrection={openCorrectionDialog}
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditViewer audit={audit} selectedTable={selectedTable} />
        </TabsContent>
      </Tabs>

      {/* The correction dialog is opened from a row's edit button in Browse. It
          lives outside the tab set so it is not tied to a tab that can never be
          reached; it keeps the row being corrected visible while it is edited. */}
      <CorrectionDialog
        open={correctionDialogOpen}
        onClose={() => setCorrectionDialogOpen(false)}
        table={selectedTable}
        row={selectedRow}
        columns={rowColumns}
        fields={correctionFields}
        setFields={setCorrectionFields}
        reason={correctionReason}
        setReason={setCorrectionReason}
        onSubmit={handleCorrect}
        isPending={correct.isPending}
      />
    </div>
  )
}

function RecordBrowser({
  selectedTable,
  setSelectedTable,
  searchQuery,
  setSearchQuery,
  cursorStack,
  setCursorStack,
  records,
  onOpenCorrection,
}: {
  selectedTable: TableName
  setSelectedTable: (table: TableName) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  cursorStack: number[]
  setCursorStack: (stack: number[]) => void
  records: ReturnType<typeof useListRecords>
  onOpenCorrection: (row: RecordRow) => void
}) {
  const items = (records.data?.items ?? []) as RecordRow[]
  const hasMore = records.data?.has_more ?? false
  // Whether the server has actually answered. Without a payload `has_more` is
  // *unknown*, and unknown must not be reported to the user as "end of
  // results" — the same absent-vs-zero discipline the tables follow.
  const endKnown = records.data !== undefined
  const nextCursor = records.data?.next_cursor ?? null
  const page = cursorStack.length + 1

  // Columns are derived from the **first row's own keys**, so a table the server
  // returns with different columns still renders. A column a given row lacks is
  // an honest em dash rather than a shifted column.
  const columnKeys = useMemo(() => {
    const first = items[0]
    if (!first) return [] as string[]
    return Object.keys(first).filter((key) => key !== 'id')
  }, [items])

  const columns = useMemo<Column<RecordRow>[]>(() => {
    const cols: Column<RecordRow>[] = [
      {
        key: 'id',
        header: 'ID',
        align: 'right',
        mono: true,
        sortValue: (row) => row.id,
        cell: (row) => row.id,
      },
      ...columnKeys.map<Column<RecordRow>>((key, index) => {
        // Only the id and columns whose values are all number/string sort; a
        // column carrying objects/arrays has no honest ordering, so it stays
        // unsortable — the sort server order. This replaces an
        // `undefined as never` sortValue cast that lied about the return type.
        const sortable = items.every((row) => {
          const value = row[key]
          return value === null || value === undefined || typeof value === 'number' || typeof value === 'string'
        })
        return {
          key,
          header: key,
          ...(sortable
            ? {
                sortValue: (row: RecordRow) => {
                  const value = row[key]
                  if (typeof value === 'number') return value
                  if (value === null || value === undefined) return ''
                  return String(value)
                },
              }
            : {}),
          cell: (row) => <CellValue value={row[key]} />,
          // Graded across the shared tiers by position, not one `md` cliff — see
          // `recordsColumnTier`. The first data column survives at every width;
          // the rest drop one tier earlier each, capped at `xl`. `DataTable`
          // announces whatever is off-screen here, so nothing on this page
          // duplicates that marker.
          hideBelow: recordsColumnTier(index),
        }
      }),
      {
        key: '__actions',
        header: <span className="sr-only">Actions</span>,
        align: 'right',
        cell: (row) => (
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-lg:size-10"
            onClick={() => onOpenCorrection(row)}
            aria-label={`Correct row ${row.id}`}
          >
            <Edit aria-hidden />
          </Button>
        ),
      },
    ]
    return cols
  }, [columnKeys, items, onOpenCorrection])

  return (
    <Card
      title="Records"
      // The request path, kept where a request path belongs. It states the
      // endpoint and the two numbers the call actually carries; the *table* moved
      // out to the chip row above, because that is applied state an operator
      // removes, not part of the request being described. `page` is the cursor
      // position — deliberately not in the URL, so it is named here instead.
      subtitle={`GET /records · limit ${formatCount(PAGE_SIZE)} · page ${formatCount(page)}`}
    >
      {/* Table selector + filter. The filter submits on Enter and clears the
          cursor stack, so a search starts at page one of the new result set. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={selectedTable} onValueChange={(value) => setSelectedTable(value as TableName)}>
          <SelectTrigger className="h-10 w-full sm:w-[220px]" aria-label="Table to browse">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHITELISTED_TABLES.map((table) => (
              <SelectItem key={table} value={table}>
                {table}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="max-w-md flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            setCursorStack([])
          }}
        >
          <label htmlFor="records-filter" className="sr-only">
            Filter {selectedTable}
          </label>
          {/* The box has no state of its own: its value is the URL's `q` and each
              keystroke writes it back through the codec (`replace`, so typing never
              fills the history). The address bar therefore always reads as the
              request that is on screen — which is the whole point of putting the
              filter in the link. */}
          <Input
            id="records-filter"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={`Search ${selectedTable}…`}
            className="h-10"
          />
        </form>
      </div>

      {/* Named before the call, not after the 403. `contributions` is on the
          server's whitelist but not on `dataset:read`: it needs `dataset:edit`,
          and its rows arrive with `email` stripped from the payload and from the
          searchable fields — so a search box that could match an address is not
          offered either. */}
      {EDITOR_ONLY_TABLES.includes(selectedTable) ? (
        <p className="mb-4 max-w-prose text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{selectedTable}</span> is editor-only: the
          list needs <code className="bg-muted px-1">dataset:edit</code>, and{' '}
          <code className="bg-muted px-1">email</code> is redacted from the rows and from the filter
          above. Contacting a contributor is not a capability of this endpoint.
        </p>
      ) : null}

      {records.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <span className="sr-only">Loading records…</span>
        </div>
      ) : records.isError ? (
        <ErrorState error={records.error} compact onRetry={() => void records.refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="No records found"
          hint={
            searchQuery
              ? // The filter is the link now, so the way back is the chip's ✕ —
                // the same control the box above is, named where the operator is stuck.
                `Nothing in ${selectedTable} matches “${searchQuery}”. Remove the filter with its ✕, or clear the box, to see the table again.`
              : `${selectedTable} returned no rows for this page.`
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(row) => String(row.id)}
            caption={`Rows of ${selectedTable}`}
            serverLimit={PAGE_SIZE}
            // This queue advances by opaque `cursor`, never by a bigger limit,
            // so the truncation notice must point at Next.
            rowsReach="cursor"
          />

          {/* Cursor pagination. Forward pushes `next_cursor` (an opaque row id);
              Back pops the stack, which is the only correct way to return to the
              previous page of an opaque cursor. */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {`Page ${page}`}
              {hasMore && ' — more rows available'}
              {!hasMore && endKnown && ' — end of results for this filter'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="max-lg:size-10"
                disabled={cursorStack.length === 0}
                onClick={() => setCursorStack(cursorStack.slice(0, -1))}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="max-lg:size-10"
                disabled={!hasMore || nextCursor === null}
                onClick={() => setCursorStack([...cursorStack, Number(nextCursor)])}
                aria-label="Next page"
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

/** One table cell value, rendered honestly by its actual JSON type. */
function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>
  }
  if (typeof value === 'object') {
    return <TruncatedValue text={JSON.stringify(value)} limit={OBJECT_CELL_LIMIT} mono />
  }
  return <TruncatedValue text={String(value)} limit={SCALAR_CELL_LIMIT} />
}

function AuditViewer({
  audit,
  selectedTable,
}: {
  audit: ReturnType<typeof useListAudit>
  selectedTable: TableName
}) {
  const items = audit.data?.items ?? []

  const columns = useMemo<Column<AuditItem>[]>(
    () => [
      {
        key: 'id',
        header: 'ID',
        align: 'right',
        mono: true,
        sortValue: (row) => row.id,
        cell: (row) => row.id,
      },
      {
        key: 'table_name',
        header: 'Table',
        sortValue: (row) => row.table_name,
        cell: (row) => row.table_name,
      },
      {
        key: 'row_id',
        header: 'Row',
        align: 'right',
        mono: true,
        sortValue: (row) => row.row_id,
        cell: (row) => row.row_id,
      },
      {
        key: 'field',
        header: 'Field',
        mono: true,
        sortValue: (row) => row.field,
        cell: (row) => row.field,
        hideBelow: 'md',
      },
      {
        key: 'old_value',
        header: 'Old value',
        sortValue: (row) => row.old_value ?? '',
        cell: (row) =>
          row.old_value === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="break-words text-muted-foreground">{row.old_value}</span>
          ),
        hideBelow: 'lg',
      },
      {
        key: 'new_value',
        header: 'New value',
        sortValue: (row) => row.new_value ?? '',
        cell: (row) =>
          row.new_value === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="break-words text-emerald-700 dark:text-emerald-300">{row.new_value}</span>
          ),
        hideBelow: 'lg',
      },
      {
        key: 'changed_at',
        header: 'Changed',
        sortValue: (row) => row.changed_at,
        cell: (row) => <span className="whitespace-nowrap text-xs">{row.changed_at}</span>,
        hideBelow: 'xl',
      },
      {
        key: 'reason',
        header: 'Reason',
        sortValue: (row) => row.reason,
        cell: (row) => <span className="break-words text-xs">{row.reason}</span>,
        hideBelow: 'lg',
      },
    ],
    [],
  )

  if (audit.isPending) {
    return (
      <Card title="Audit log" subtitle="GET /audit · loading…">
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Card>
    )
  }

  // The failure renders *inside* the panel it describes rather than as a bare
  // banner below it — same "Audit log" Card frame as every other state, so a
  // read failure never looks like a detached widget. `ErrorState` owns the
  // error copy/tone (a 401/403 is not painted like an outage).
  if (audit.isError) {
    return (
      <Card title="Audit log" subtitle="GET /audit">
        <ErrorState error={audit.error} compact onRetry={() => void audit.refetch()} />
      </Card>
    )
  }

  // Same split as the Records panel: the subtitle describes the request, the chip
  // row above states which table that request was scoped to (and here the table
  // filter is real — the audit query only sends `table` while this tab is open).
  // The number is what this payload returned, never a total: `/audit` is a
  // capped tail with no count, and `/review/stats` does not exist on the
  // versioned API.
  return (
    <Card
      title="Audit log"
      subtitle={`GET /audit · limit ${formatCount(AUDIT_LIMIT)} · ${formatCount(items.length)} fetched`}
    >
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => String(row.id)}
        caption={`data_audit_log tail for ${selectedTable}`}
        pageSize={25}
        serverLimit={AUDIT_LIMIT}
        filterable
        filterPlaceholder="Filter audit entries…"
        empty={
          <Empty
            title="No audit entries"
            hint={
              selectedTable === DEFAULT_REVIEW_TABLE
                ? 'Nothing has been corrected for this table yet.'
                : // The audit tail is scoped by the table chip, so name the control
                  // that would widen it — the ✕ the chip row actually offers.
                  `Nothing has been corrected in ${selectedTable} yet. The Table chip’s ✕ above goes back to ${DEFAULT_REVIEW_TABLE}.`
            }
          />
        }
      />
    </Card>
  )
}

function CorrectionDialog({
  open,
  onClose,
  table,
  row,
  columns,
  fields,
  setFields,
  reason,
  setReason,
  onSubmit,
  isPending,
}: {
  open: boolean
  onClose: () => void
  table: TableName
  row: RecordRow | null
  columns: string[]
  fields: Record<string, string>
  setFields: React.Dispatch<React.SetStateAction<Record<string, string>>>
  reason: string
  setReason: (r: string) => void
  onSubmit: () => void
  isPending: boolean
}) {
  // The dialog is mounted for the whole page lifetime (it is an overlay, not a
  // tab panel), so a null row simply means "nothing to correct" — the dialog is
  // closed and renders nothing.
  if (!row) return null
  // A field is "changed" only when it was **touched and differs** from the row.
  // The previous version prefilled every input with the current value and sent
  // whatever key existed in state, so a visitor who opened a box and closed it
  // again produced a correction identical to the data already there.
  const changedKeys = columns.filter((col) => {
    if (!(col in fields)) return false
    return fields[col] !== String(row[col] ?? '')
  })
  const reasonError = reason.trim() === '' ? 'Enter why this correction is needed.' : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit correction</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{table}</span> row{' '}
            <span className="font-mono">{row.id}</span> —{' '}
            {changedKeys.length === 0
              ? 'edit a column to stage a change.'
              : `${changedKeys.length} column${changedKeys.length === 1 ? '' : 's'} staged: ${changedKeys.join(', ')}.`}{' '}
            <code className="bg-muted px-1">id</code> is immutable, and every corrected column
            writes a row to <code className="bg-muted px-1">data_audit_log</code>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {columns.map((col) => {
              const original = String(row[col] ?? '')
              const touched = col in fields
              const changed = touched && fields[col] !== original
              return (
                <Field key={col} data-changed={changed ? 'true' : undefined}>
                  <FieldLabel htmlFor={`correction-${col}`} className="flex items-center gap-1.5">
                    <span className="font-mono">{col}</span>
                    {changed && (
                      <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                        changed
                      </span>
                    )}
                  </FieldLabel>
                  <Input
                    id={`correction-${col}`}
                    value={touched ? fields[col] : original}
                    onChange={(e) => setFields((prev) => ({ ...prev, [col]: e.target.value }))}
                    placeholder={original || '(empty)'}
                    className={cn('h-10 font-mono text-xs', changed && 'border-primary')}
                  />
                </Field>
              )
            })}
          </div>
          <Field data-invalid={reasonError ? 'true' : undefined}>
            <FieldLabel htmlFor="correction-reason">
              Reason <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this correction is needed — typo fix, ZVS 2018 compliance, wrong gloss…"
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? 'correction-reason-error' : undefined}
              rows={3}
              className="min-h-[88px]"
            />
            {reasonError ? (
              <FieldError id="correction-reason-error">{reasonError}</FieldError>
            ) : (
              <p className="text-xs text-muted-foreground">
                Recorded verbatim in the audit trail for this row.
              </p>
            )}
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="max-lg:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="max-lg:h-10"
              // Nothing staged, or no reason, means there is no correction to
              // apply — disabled rather than failing after the click.
              disabled={isPending || changedKeys.length === 0 || reason.trim() === ''}
            >
              {isPending ? 'Applying…' : `Apply ${changedKeys.length || ''} correction${changedKeys.length === 1 ? '' : 's'}`.trim()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
