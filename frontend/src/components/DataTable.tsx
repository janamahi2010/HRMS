import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { Key, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from './ui/card'
import { Skeleton, SkeletonGroup } from './ui/skeleton'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  className?: string
  headerClassName?: string
  /** Skeleton bar width for this column */
  skeletonWidth?: string
  /** Header can be clicked to sort by this column (needs `sort` + `onSort` on the table). */
  sortable?: boolean
}

export interface SortState {
  key: string
  desc: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  getRowId: (row: T) => Key
  isLoading?: boolean
  /** Card renderer used below md (tables become card lists on mobile). */
  mobileCard: (row: T) => ReactNode
  empty?: ReactNode
  skeletonRows?: number
  onRowClick?: (row: T) => void
  /** Fired on hover/focus of a row, e.g. to prefetch its detail page. */
  onRowIntent?: (row: T) => void
  /** Dim rows while a background refetch / page change is in flight. */
  fetching?: boolean
  caption?: string
  /** Current sort (null = the list's default order). */
  sort?: SortState | null
  onSort?: (key: string) => void
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading,
  mobileCard,
  empty,
  skeletonRows = 6,
  onRowClick,
  onRowIntent,
  fetching,
  caption,
  sort,
  onSort,
}: DataTableProps<T>) {
  if (isLoading) return <DataTableSkeleton columns={columns} rows={skeletonRows} />
  if (!rows || rows.length === 0) return <Card>{empty}</Card>

  return (
    <div className={cn('transition-opacity duration-150', fetching && 'opacity-60')}>
      {/* Desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {columns.map((c) => {
                  const active = !!(c.sortable && onSort && sort?.key === c.key)
                  const Icon = !active ? ChevronsUpDown : sort!.desc ? ArrowDown : ArrowUp
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : undefined}
                      className={cn(
                        'h-11 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground',
                        c.sortable && onSort ? 'px-2' : 'px-4',
                        c.headerClassName,
                      )}
                    >
                      {c.sortable && onSort ? (
                        <button
                          type="button"
                          onClick={() => onSort(c.key)}
                          className={cn(
                            'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 uppercase tracking-wide transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                            active && 'text-foreground',
                          )}
                        >
                          {c.header}
                          <Icon className={cn('size-3.5 shrink-0', !active && 'opacity-40')} aria-hidden />
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onPointerEnter={onRowIntent ? () => onRowIntent(row) : undefined}
                  className={cn(
                    'border-b border-border transition-colors last:border-0 hover:bg-muted/40',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowId(row)}>{mobileCard(row)}</li>
        ))}
      </ul>
    </div>
  )
}

export function DataTableSkeleton<T>({ columns, rows = 6 }: { columns: Column<T>[]; rows?: number }) {
  return (
    <SkeletonGroup label="Loading list">
      <Card className="hidden overflow-hidden md:block">
        <div className="flex h-11 items-center gap-4 border-b border-border bg-muted/50 px-4">
          {columns.map((c) => (
            <Skeleton key={c.key} className={cn('h-3', c.skeletonWidth ?? 'w-20', 'flex-1')} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex h-[60px] items-center gap-4 border-b border-border px-4 last:border-0">
            {columns.map((c, j) => (
              <div key={c.key} className="flex flex-1 items-center gap-3">
                {j === 0 && <Skeleton className="size-9 shrink-0 rounded-full" />}
                <Skeleton className={cn('h-3.5', c.skeletonWidth ?? 'w-24')} />
              </div>
            ))}
          </div>
        ))}
      </Card>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: Math.min(rows, 5) }).map((_, i) => (
          <Card key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </Card>
        ))}
      </div>
    </SkeletonGroup>
  )
}
