import { CalendarHeart, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useHolidays } from '@/features/settings/api'
import { parseISODate, todayIST } from '@/lib/date'
import { cn } from '@/lib/utils'

/** Full holiday list for a year, readable by everyone (the Settings tab is admin-only). */
export function HolidaysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = todayIST()
  const thisYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const q = useHolidays(year)
  const list = q.data ?? []
  const upcoming = list.filter((h) => h.date >= today).length

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Holidays"
      description={q.data ? `${list.length} holiday${list.length === 1 ? '' : 's'} in ${year}${year === thisYear ? ` · ${upcoming} still to come` : ''}` : `Company holidays for ${year}`}
    >
      <div className="mb-4 flex items-center justify-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
          <ChevronLeft />
        </Button>
        <span className="tabular min-w-16 text-center text-sm font-semibold" aria-live="polite">
          {year}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear + 1} aria-label="Next year">
          <ChevronRight />
        </Button>
      </div>
      {q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState compact icon={CalendarHeart} title={`No holidays added for ${year}`} description="Your admin adds them in Company settings." />
      ) : (
        <ul className="space-y-2">
          {list.map((h) => {
            const dt = parseISODate(h.date)
            const past = h.date < today
            const isToday = h.date === today
            return (
              <li key={h.id} className={cn('flex items-center gap-3 rounded-xl border border-border p-2.5', past && 'opacity-60')}>
                <div
                  className={cn(
                    'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg',
                    past ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-primary-soft-foreground',
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase leading-none">{format(dt, 'MMM')}</span>
                  <span className="tabular text-sm font-semibold leading-tight">{format(dt, 'd')}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{format(dt, 'EEEE')}</p>
                </div>
                {isToday && <Badge tone="success">Today</Badge>}
                {past && !isToday && <span className="text-xs text-muted-foreground">Past</span>}
              </li>
            )
          })}
        </ul>
      )}
    </ResponsiveDialog>
  )
}
