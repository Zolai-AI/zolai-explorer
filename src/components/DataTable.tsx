import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from '@tanstack/react-table/legacy'
import {
  flexRender,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  alignClass,
  dataTableSortFn,
  hideBelowClass,
  pageRange,
  resolvePageSize,
  rowsSummary,
  type HideBelow,
} from '../lib/datatable'
import { cn } from '../lib/utils'

export type Column<T> = {
  key: string
  header: ReactNode
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode
  align?: 'left' | 'right' | 'center'
  /** Numeric sort key; omit to make the column unsortable. */
  sortValue?: (row: T) => number | string
  /** Hide the column below the given breakpoint to keep 375px usable. */
  hideBelow?: HideBelow
  mono?: boolean
}

/**
 * Sortable, responsive table built on shadcn `<Table>` + TanStack Table.
 *
 * - **Sorting** is TanStack's row-sorting feature over an `accessorFn` that
 *   returns the column's `sortValue`; the comparator lives in
 *   `src/lib/datatable.ts` so it is unit tested.
 * - **Responsive hiding** is pure CSS: a `hideBelow` column renders
 *   `hidden md:table-cell`, so 375px keeps the priority columns and the rest
 *   appear as the viewport grows. Columns marked `hideBelow` must never be the
 *   only place a value appears.
* - **Horizontal scroll**: shadcn's table container scrolls, and
 *   `scroll-fade-x` fades the edges so a clipped column is visibly clipped
 *   rather than silently cut.
 *
 * Pagination and column visibility are **opt-in** via `pageSize` /
 * `columnVisibility`: they only earn their space on tables that can hold more
 * than a handful of rows, so the 12-row collections tables stay clean.
 *
 * `serverLimit` marks a table whose rows come from a paginated API route. The
 * footer then reports `showing N rows (limit L)` — never a total the server did
 * not send — and says so explicitly when `N === L`, because that means the list
 * may be truncated. `pageSizeOptions` adds a page-size `<Select>`.
 */
export function DataTable<T extends RowData>({
  columns,
  rows,
  rowKey,
  caption,
  empty = null,
  pageSize,
  columnVisibility = false,
  pageSizeOptions,
  serverLimit = null,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  caption?: string
  empty?: ReactNode
  /** Enable pagination with this page size (e.g. 10). Omit to show every row. */
  pageSize?: number
  /** Enable the "columns" dropdown that hides/shows each column. */
  columnVisibility?: boolean
  /**
   * Server-side `limit` behind these rows. When set, the footer says
   * `showing N rows (limit L)` and warns when the list may be truncated.
   */
  serverLimit?: number | null
  /** Offer a page-size `<Select>` with these choices (implies `pageSize`). */
  pageSizeOptions?: readonly number[]
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibilityState, setColumnVisibilityState] = useState<ColumnVisibilityState>({})
  // A page-size choice list implies pagination: without a `pageSize` prop the
  // component widens the page to the row count and shows every row.
  const choices = pageSizeOptions ?? null
  const paginate = (typeof pageSize === 'number' && pageSize > 0) || choices !== null
  const initialSize = resolvePageSize(pageSize ?? choices?.[0], choices ?? undefined, 10)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: paginate ? initialSize : 10,
  })
  const summary = rowsSummary(rows.length, serverLimit)

  // A non-paginated table must keep showing *every* row, including rows that
  // only arrive after the first render (a refetch can grow the list). Rather
  // than conditionally wiring the pagination row model, widen the page to the
  // row count — one page, nothing hidden.
  useEffect(() => {
    if (paginate) return
    setPagination((current) =>
      current.pageSize === rows.length
        ? current
        : { pageIndex: 0, pageSize: Math.max(rows.length, 1) },
    )
  }, [paginate, rows.length])

  const specs = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])

  const defs = useMemo<LegacyColumnDef<T>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        // TanStack needs an accessor even for display columns; a sortable
        // column resolves its sortValue, an unsortable one resolves null.
        accessorFn: column.sortValue ? (row: T) => column.sortValue?.(row) : () => null,
        // Function form: TanStack types a header template as `string | (ctx) => any`,
        // and every header here is a ReactNode.
        header: () => column.header,
        cell: (info) => column.cell(info.row.original, info.row.index),
        enableSorting: Boolean(column.sortValue),
        sortFn: column.sortValue ? dataTableSortFn : undefined,
        sortDescFirst: true,
      })),
    [columns],
  )

  const table = useLegacyTable({
    data: rows,
    columns: defs,
    // Reuse the caller's key so row identity survives re-sorts.
    getRowId: (row, index) => rowKey(row, index),
    state: { sorting, columnVisibility: columnVisibilityState, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibilityState,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel<T>(),
    getSortedRowModel: getSortedRowModel<T>(),
    getFilteredRowModel: getFilteredRowModel<T>(),
    getPaginationRowModel: getPaginationRowModel<T>(),
  })

  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {columnVisibility && (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                className="max-lg:h-10"
                aria-label="Choose which columns to show"
              >
                <Columns3 aria-hidden />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().map((leaf) => (
                <DropdownMenuCheckboxItem
                  key={leaf.id}
                  className="max-lg:min-h-10"
                  checked={leaf.getIsVisible()}
                  onCheckedChange={(checked) => leaf.toggleVisibility(Boolean(checked))}
                  onSelect={(event) => event.preventDefault()}
                >
                  {specs.get(leaf.id)?.header ?? leaf.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Table containerClassName="scrollbar-thin scroll-fade-x">
        {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const spec = specs.get(header.column.id)
                const sorted = header.column.getIsSorted()
                const align = alignClass(spec?.align)
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : undefined
                    }
                    className={cn(align, header.column.getCanSort() && 'p-0', hideBelowClass(spec?.hideBelow))}
                  >
                    {header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          '-ml-2 h-9 gap-1 px-2 font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground',
                          align === 'right' && '-mr-2 ml-auto flex-row-reverse',
                          align === 'center' && 'mx-auto flex-row-reverse',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp aria-hidden />
                        ) : sorted === 'desc' ? (
                          <ArrowDown aria-hidden />
                        ) : (
                          <ChevronsUpDown className="opacity-40" aria-hidden />
                        )}
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const spec = specs.get(cell.column.id)
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      alignClass(spec?.align),
                      'max-lg:whitespace-normal',
                      spec?.mono && 'font-mono text-xs',
                      hideBelowClass(spec?.hideBelow),
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
        {paginate && table.getRowModel().rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
              No rows on this page.
            </TableCell>
          </TableRow>
        )}
        {paginate && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columns.length} className="text-xs font-normal">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground tabular-nums">
                    {serverLimit === null
                      ? pageRange(
                          table.getState().pagination.pageIndex,
                          pagination.pageSize,
                          rows.length,
                        )
                      : summary.text}
                    {summary.truncated && (
                      <span className="ml-2 text-amber-700 dark:text-amber-300">
                        {summary.notice}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {choices && (
                      <Select
                        value={String(pagination.pageSize)}
                        onValueChange={(value) =>
                          setPagination({
                            pageIndex: 0,
                            pageSize: resolvePageSize(value, choices, initialSize),
                          })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="max-lg:h-10"
                          aria-label="Rows per page"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {choices.map((choice) => (
                            <SelectItem key={choice} value={String(choice)}>
                              {choice} rows
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="outline"
                      size="xs"
                      className="max-lg:h-10"
                      disabled={!table.getCanPreviousPage()}
                      onClick={() => table.previousPage()}
                      aria-label="Previous page"
                    >
                      <ChevronLeft aria-hidden />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      className="max-lg:h-10"
                      disabled={!table.getCanNextPage()}
                      onClick={() => table.nextPage()}
                      aria-label="Next page"
                    >
                      Next
                      <ChevronRight aria-hidden />
                    </Button>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  )
}

