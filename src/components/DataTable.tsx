import { useMemo, useState, type ReactNode } from 'react'
import {
  getCoreRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from '@tanstack/react-table/legacy'
import { flexRender, type RowData, type SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Button } from './ui/button'
import {
  alignClass,
  dataTableSortFn,
  hideBelowClass,
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
 */
export function DataTable<T extends RowData>({
  columns,
  rows,
  rowKey,
  caption,
  empty = null,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  caption?: string
  empty?: ReactNode
}) {
  const [sorting, setSorting] = useState<SortingState>([])

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
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (rows.length === 0 && empty) return <>{empty}</>

  return (
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
    </Table>
  )
}
