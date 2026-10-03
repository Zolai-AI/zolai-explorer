import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

export type Column<T> = {
  key: string
  header: ReactNode
  /** Cell renderer. Return a primitive for built-in numeric/right alignment. */
  cell: (row: T, index: number) => ReactNode
  align?: 'left' | 'right' | 'center'
  /** Numeric sort key; omit to make the column unsortable. */
  sortValue?: (row: T) => number | string
  /** Hide the column below the given breakpoint to keep 375px usable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  mono?: boolean
}

const HIDE_CLASS: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

export function DataTable<T>({
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
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.sortValue) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a)
      const bv = column.sortValue!(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
      return String(av).localeCompare(String(bv)) * factor
    })
  }, [rows, sort, columns])

  if (rows.length === 0 && empty) return <>{empty}</>

  const toggle = (column: Column<T>) => {
    if (!column.sortValue) return
    setSort((prev) =>
      prev?.key === column.key
        ? { key: column.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, dir: 'desc' },
    )
  }

  return (
    <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-slate-800">
            {columns.map((column) => {
              const align = column.align ?? 'left'
              const active = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-400 uppercase ${
                    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                  } ${column.hideBelow ? HIDE_CLASS[column.hideBelow] : ''}`}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(column)}
                      className="inline-flex items-center gap-1 transition hover:text-slate-200"
                    >
                      {column.header}
                      {active &&
                        (sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        ))}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-slate-800/60 transition last:border-0 hover:bg-slate-800/25"
            >
              {columns.map((column) => {
                const align = column.align ?? 'left'
                return (
                  <td
                    key={column.key}
                    className={`px-3 py-2 align-top text-slate-300 ${
                      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                    } ${column.mono ? 'font-mono text-xs' : ''} ${
                      column.hideBelow ? HIDE_CLASS[column.hideBelow] : ''
                    }`}
                  >
                    {column.cell(row, index)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}