import { useCallback, useEffect, useState } from 'react'
import { FileText, Edit, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useListRecords, useListAudit, useCorrectRecord } from '../features/review/api'
import { Card } from '../components/Card'
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
import { Field, FieldLabel } from '../components/ui/field'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { can, useRole } from '../lib/auth'
import { formatCount } from '../lib/format'
import { cn } from '../lib/utils'

const WHITELISTED_TABLES = [
  'dictionary',
  'bible_verses',
  'grammar_patterns',
  'phrases',
  'vocabulary',
] as const

type TableName = typeof WHITELISTED_TABLES[number]

type RecordRow = Record<string, unknown> & { id: number }

export function Review() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [activeTab, setActiveTab] = useState<'browse' | 'audit' | 'correct'>('browse')
  const [selectedTable, setSelectedTable] = useState<TableName>('dictionary')
  const [searchQuery, setSearchQuery] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<RecordRow | null>(null)
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false)
  const [correctionFields, setCorrectionFields] = useState<Record<string, string>>({})
  const [correctionReason, setCorrectionReason] = useState('')

  // Browse records
  const records = useListRecords({
    table: selectedTable,
    q: searchQuery || undefined,
    limit: 50,
    cursor: cursor ? parseInt(cursor, 10) : undefined,
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

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg border bg-muted/20 p-1" role="tablist">
        {[
          { id: 'browse', label: 'Browse', icon: FileText },
          { id: 'audit', label: 'Audit Log', icon: AlertTriangle },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              'flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="size-4" aria-hidden />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'browse' && (
        <RecordBrowser
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          cursor={cursor}
          setCursor={setCursor}
          records={records}
          onOpenCorrection={openCorrectionDialog}
        />
      )}

      {activeTab === 'audit' && (
        <AuditViewer audit={audit} selectedTable={selectedTable} />
      )}

      {activeTab === 'correct' && selectedRow && (
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
      )}

      {!isAdmin && activeTab === 'correct' && !selectedRow && (
        <Card title="No row selected" tone="muted">
          <p className="text-sm text-muted-foreground">
            Select a row from the <strong>Browse</strong> tab to submit a correction. Admin scope
            <code className="px-1 bg-muted">dataset:edit</code> is required.
          </p>
        </Card>
      )}
    </div>
  )
}

function RecordBrowser({
  selectedTable,
  setSelectedTable,
  searchQuery,
  setSearchQuery,
  cursor,
  setCursor,
  records,
  onOpenCorrection,
}: {
  selectedTable: TableName
  setSelectedTable: (t: TableName) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  cursor: string | null
  setCursor: (c: string | null) => void
  records: ReturnType<typeof import('../features/review/api').useListRecords>
  onOpenCorrection: (row: RecordRow) => void
}) {
  const data = records.data
  const items = (data?.items ?? []) as RecordRow[]
  const hasMore = data?.has_more ?? false
  const nextCursor = data?.next_cursor ?? null

  if (records.isPending) {
    return (
      <Card title="Records" subtitle={`Loading ${selectedTable}…`}>
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <span className="sr-only">Loading records…</span>
        </div>
      </Card>
    )
  }

  if (records.isError) {
    return <ErrorState error={records.error} compact onRetry={() => void records.refetch()} />
  }

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setCursor(null)
  }, [setCursor])

  const handlePage = useCallback((nextCursor: string | null) => {
    setCursor(nextCursor)
  }, [setCursor])

  return (
    <Card
      title="Records"
      subtitle={`GET /api/v1/records?table=${selectedTable} · ${formatCount(items.length)} row${items.length === 1 ? '' : 's'}`}
    >
      {/* Table selector + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={selectedTable} onValueChange={setSelectedTable as (v: TableName) => void}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select table…" />
          </SelectTrigger>
          <SelectContent>
            {WHITELISTED_TABLES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${selectedTable}…`}
            className="h-10"
          />
        </form>
      </div>

      {/* Records table */}
      {items.length === 0 ? (
        <Empty title="No records found" hint="Try a different search term or table." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  {Object.keys(items[0] || {}).map((key) => (
                    <TableHead key={key} className="max-w-xs truncate">{key}</TableHead>
                  ))}
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.id}</TableCell>
                    {Object.entries(row).map(([key, value]) => (
                      <TableCell key={key} className="max-w-xs truncate">
                        {value === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : typeof value === 'object' ? (
                          <span className="text-muted-foreground text-xs">{JSON.stringify(value).slice(0, 80)}</span>
                        ) : (
                          <span className="text-sm">{String(value).slice(0, 100)}</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => onOpenCorrection(row)}
                        aria-label={`Correct row ${row.id}`}
                      >
                        <Edit className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">
              Showing {formatCount(items.length)} rows{hasMore ? ' (limit reached)' : ''}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!cursor}
                onClick={() => handlePage(cursor ? String(Math.max(0, parseInt(cursor, 10) - 50)) : null)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || !nextCursor}
                onClick={() => handlePage(nextCursor)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function AuditViewer({
  audit,
  selectedTable,
}: {
  audit: ReturnType<typeof import('../features/review/api').useListAudit>
  selectedTable: TableName
}) {
  const data = audit.data
  const items = data?.items ?? []

  if (audit.isPending) {
    return (
      <Card title="Audit Log" subtitle="Loading…">
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Card>
    )
  }

  if (audit.isError) {
    return <ErrorState error={audit.error} compact onRetry={() => void audit.refetch()} />
  }

  return (
    <Card
      title="Audit Log"
      subtitle={`GET /api/v1/audit${selectedTable ? `?table=${selectedTable}` : ''} · ${formatCount(items.length)} entr${items.length === 1 ? 'y' : 'ies'}`}
    >
      {items.length === 0 ? (
        <Empty title="No audit entries" hint="No changes have been audited yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Table</TableHead>
                <TableHead className="w-20">Row</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old Value</TableHead>
                <TableHead>New Value</TableHead>
                <TableHead className="w-40">Changed</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.id}</TableCell>
                  <TableCell>{row.table_name}</TableCell>
                  <TableCell className="font-mono text-sm">{row.row_id}</TableCell>
                  <TableCell className="font-mono text-sm">{row.field}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{row.old_value ?? '—'}</TableCell>
                  <TableCell className="max-w-xs truncate text-green-600">{row.new_value ?? '—'}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{row.changed_at}</TableCell>
                  <TableCell className="max-w-md truncate text-xs">{row.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
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
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit Correction</DialogTitle>
          <DialogDescription>
            Table: <code className="px-1 bg-muted">{table}</code> · Row ID: <code className="px-1 bg-muted">{row.id}</code>
            <br />
            Only whitelisted columns are editable; <code className="px-1 bg-muted">id</code> is immutable.
            On lexicon tables, <code className="px-1 bg-muted">review_status</code> will be set to <code className="px-1 bg-muted">reviewed</code>.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
          <div className="grid gap-4 sm:grid-cols-2">
            {columns.map((col) => (
              <Field key={col}>
                <FieldLabel htmlFor={`correction-${col}`}>{col}</FieldLabel>
                <Input
                  id={`correction-${col}`}
                  value={fields[col] ?? String(row[col] ?? '')}
                  onChange={(e) => setFields((prev) => ({ ...prev, [col]: e.target.value }))}
                  placeholder={String(row[col] ?? '')}
                  className="h-10"
                />
              </Field>
            ))}
          </div>
          <Field>
            <FieldLabel htmlFor="correction-reason">Reason <span className="text-destructive">*</span></FieldLabel>
            <Textarea
              id="correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this correction is needed (e.g., typo fix, ZVS 2018 compliance)"
              rows={3}
              className="h-24"
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="max-lg:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="max-lg:h-10" disabled={isPending}>
              {isPending ? 'Applying…' : 'Apply Correction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
