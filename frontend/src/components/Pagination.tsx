import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

interface PaginationProps {
  page: number
  totalPages: number
  count: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
  /** Shows a subtle indicator while the next page loads (previous data stays visible). */
  fetching?: boolean
}

export function Pagination({ page, totalPages, count, pageSize, onPageChange, className, fetching }: PaginationProps) {
  if (count === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, count)
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-3 pt-4', className)}>
      <p className={cn('tabular text-sm text-muted-foreground transition-opacity', fetching && 'opacity-60')}>
        <span className="hidden sm:inline">Showing </span>
        <span className="font-medium text-foreground">
          {from}–{to}
        </span>{' '}
        of <span className="font-medium text-foreground">{count}</span>
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="tabular min-w-[4.5rem] text-center text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="icon" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      )}
    </nav>
  )
}
