import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Edit, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import {
  RECORDS_WHITELIST,
  useListRecords,
  useListAudit,
  useCorrectRecord,
  type TableName,
  type AuditItem,
} from '../features/review/api'
import { Card } from '../components/Card'
import { DataTable, type Column } from '../components/DataTable'
import { Empty } from '../components/Empty'
import { ErrorState } from '../components/ErrorState'
import { Skeleton } from '../components/Skeleton'
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
import { cn } from '../lib/utils'

/**
 * The whitelist is the server's, imported from the transport rather than
 * re-typed here — a second list is a second truth, and `recordsRouter`
 * 400s on anything it does not know.
 */
const WHITELISTED_TABLES = RECORDS_WHITELIST

type RecordRow = Record<string, unknown> & { id: number }

const PAGE_SIZE = 50

type ReviewTab = 'browse' | 'audit' | 'correct'

export function Review() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [activeTab, setActiveTab] = useState<ReviewTab>('browse')
  const [selectedTable, setSelectedTable] = useState<TableName>('dictionary')
  const [searchQuery, setSearchQuery] = useState('')
  // The server's `cursor` is an **opaque id of the last item seen**
  // (`WHERE id > ?`), so it cannot be stepped backwards arithmetically — the old
  // Previous button did `parseInt(cursor) - 50` and, because the cursor was
  // never even sent, "Next" re-fetched page 1 while "Previous" jumped to a row
  // id that happened to land mid-list. Paging is therefore a **stack**: each
  // advance pushes the cursor it came from, so Back returns to exactly the page
  // the user was on.
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
    limit: 50,
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
          toast.error('Correction failed', { description: error instanceof Error ? error.message : String(error) }),
      },
    )
  }, [selectedRow, selectedTable, correctionFields, correctionReason, correct, records, audit])

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <FileText className="size-5 text-primary" aria-hidden />
            Review Queue
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Browse whitelisted tables, inspect audit history, and submit field corrections. Corrections are
            audited in <code className="px-1 bg-muted">data_audit_log</code>; the <code className="px-1 bg-muted">review_status</code>
            column is set to <code className="px-1 bg-muted">reviewed</code> on lexicon tables where it exists.
          </p>
        </div>
        {isAdmin && (
          <Badge variant="outline" className="text-xs">
            Admin: dataset:edit scope
          </Badge>
        )}
      </header>

      {/* shadcn Tabs: keyboard arrow navigation, roving focus and the
          `aria-selected` wiring that the hand-rolled `role="tablist"` + plain
          `<button>` pair never provided — a screen reader announced two buttons,
          not a tab set. */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReviewTab)}>
        <TabsList>
          <TabsTrigger value="browse" className="max-lg:h-10">
            <FileText aria-hidden />
            Browse
          </TabsTrigger>
          <TabsTrigger value="audit" className="max-lg:h-10">
            <ScrollText aria-hidden />
            Audit log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
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

        {/* Corrections live in a dialog opened from a row action rather than a
            tab: a tab with no selection is an empty shell, and the dialog keeps
            the row being corrected visible while it is edited. */}
        <TabsContent value="correct">
          {selectedRow ? (
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
          ) : (
            <Card title="No row selected" tone="muted">
              <p className="text-sm text-muted-foreground">
                Pick a row in <strong>Browse</strong> and press its edit button to submit a
                correction. The admin scope <code className="bg-muted px-1">dataset:edit</code> is
                required.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
      ...columnKeys.map<Column<RecordRow>>((key) => ({
        key,
        header: key,
        // Only the id and the obvious text columns sort; the rest stay in
        // server order, which is the order the table is meant to be read in.
        sortValue: (row) => {
          const value = row[key]
          if (typeof value === 'number' || typeof value === 'string') return value
          return undefined as never
        },
        cell: (row) => <CellValue value={row[key]} />,
        // Below `lg` only the id plus the first two columns survive, so the
        // word/english of a lexicon row is never the sole place a value appears.
        hideBelow: key === columnKeys[0] ? undefined : 'md',
      })),
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
  }, [columnKeys, onOpenCorrection])

  return (
    <Card
      title="Records"
      subtitle={`GET /records?table=${selectedTable} · page ${page}`}
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
              ? `Nothing in ${selectedTable} matches “${searchQuery}”.`
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
          />

          {/* Cursor pagination. Forward pushes `next_cursor` (an opaque row id);
              Back pops the stack, which is the only correct way to return to the
              previous page of an opaque cursor. */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {`Page ${page}`}
              {hasMore && ' — more rows available'}
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
    // Nested objects (morphology, metadata) are shown truncated with the full
    // value available to a screen reader, rather than pretending to be text.
    const text = JSON.stringify(value)
    return (
      <span className="text-xs text-muted-foreground" title={text}>
        {text.length > 80 ? `${text.slice(0, 80)}…` : text}
      </span>
    )
  }
  const text = String(value)
  return <span className="break-words">{text.length > 120 ? `${text.slice(0, 120)}…` : text}</span>
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
      <Card title="Audit log" subtitle="loading…">
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Card>
    )
  }

  if (audit.isError) return <ErrorState error={audit.error} compact onRetry={() => void audit.refetch()} />

  return (
    <Card
      title="Audit log"
      subtitle={`GET /audit?table=${selectedTable} · ${formatCount(items.length)} entr${items.length === 1 ? 'y' : 'ies'}`}
    >
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => String(row.id)}
        caption={`data_audit_log tail for ${selectedTable}`}
        pageSize={25}
        serverLimit={50}
        empty={
          <Empty
            title="No audit entries"
            hint="Nothing has been corrected for this table yet."
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
  row: RecordRow
  columns: string[]
  fields: Record<string, string>
  setFields: React.Dispatch<React.SetStateAction<Record<string, string>>>
  reason: string
  setReason: (r: string) => void
  onSubmit: () => void
  isPending: boolean
}) {
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
                      <span className="text-[10px] font-semibold tracking-wide text-primary uppercase">
                        changed
                      </span>
                    )}
                  </FieldLabel>
                  <Input
                    id={`correction-${col}`}
                    value={touched ? fields[col] : original}
                    onChange={(e) => setFields((prev) => ({ ...prev, [col]: e.target.value }))}
                    placeholder={original || '(empty)'}
                    aria-invalid={changed ? undefined : undefined}
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
