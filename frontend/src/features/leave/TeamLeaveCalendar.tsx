import { CalendarX2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useMonthNav } from '@/features/attendance/AttendanceCalendar'
import { todayIST } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useTeamLeaveCalendar } from './api'

const pad = (n: number) => String(n).padStart(2, '0')

export function TeamLeaveCalendar() {
  const nav = useMonthNav()
  const q = useTeamLeaveCalendar(nav.year, nav.month)
  const today = todayIST()
  const dim = new Date(nav.year, nav.month, 0).getDate()
  const dates = useMemo(
    () => Array.from({ length: dim }, (_, i) => `${nav.year}-${pad(nav.month)}-${pad(i + 1)}`),
    [dim, nav.year, nav.month],
  )

  const data = q.data && q.data.year === nav.year && q.data.month === nav.month ? q.data : undefined
  const scroller = useRef<HTMLDivElement>(null)
  // Start scrolled to this week on narrow screens.
  useEffect(() => {
    const el = scroller.current
    const cell = el?.querySelector<HTMLElement>('[data-today]')
    if (el && cell) el.scrollLeft = Math.max(0, cell.offsetLeft - el.clientWidth / 2)
  }, [data])
  const holidays = useMemo(() => new Map(data?.holidays.map((h) => [h.date, h.name])), [data])
  const offs = new Set(data?.weekly_offs ?? [])
  const isOff = (iso: string) => {
    const wd = (new Date(iso + 'T00:00:00').getDay() + 6) % 7
    return offs.has(wd) || holidays.has(iso)
  }

  // user -> date -> leave
  const grid = useMemo(() => {
    const m = new Map<number, Map<string, NonNullable<typeof data>['leaves'][number]>>()
    for (const l of data?.leaves ?? []) {
      const row = m.get(l.user_id) ?? new Map()
      for (const iso of dates) if (iso >= l.from_date && iso <= l.to_date) row.set(iso, l)
      m.set(l.user_id, row)
    }
    return m
  }, [data, dates])

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={nav.prev} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <h2 className="min-w-32 text-center text-sm font-semibold">{format(new Date(nav.year, nav.month - 1, 1), 'MMMM yyyy')}</h2>
          <Button variant="ghost" size="icon-sm" onClick={nav.next} aria-label="Next month">
            <ChevronRight />
          </Button>
          {!nav.isCurrent && (
            <Button variant="link" size="sm" onClick={nav.reset} className="px-2">
              Today
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-primary" aria-hidden /> Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-primary/35 ring-1 ring-inset ring-primary" aria-hidden /> Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-muted" aria-hidden /> Off / holiday
          </span>
        </div>
      </div>

      {q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      ) : !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : data.members.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No team members" />
      ) : (
        <div ref={scroller} className={cn('overflow-x-auto transition-opacity', q.isFetching && 'opacity-60')}>
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <caption className="sr-only">Team leave calendar</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-28 border-b sm:min-w-40 border-border bg-card px-4 py-2 text-left font-medium text-muted-foreground">
                  Person
                </th>
                {dates.map((iso) => {
                  const dt = new Date(iso + 'T00:00:00')
                  return (
                    <th
                      key={iso}
                      scope="col"
                      data-today={iso === today ? '' : undefined}
                      title={holidays.get(iso)}
                      className={cn(
                        'w-8 min-w-8 border-b border-border py-1.5 text-center font-medium',
                        isOff(iso) ? 'bg-muted/60 text-muted-foreground' : 'text-foreground',
                        iso === today && 'text-primary',
                      )}
                    >
                      <div className="text-[10px] uppercase opacity-70">{format(dt, 'EEEEE')}</div>
                      <div className={cn('tabular mx-auto flex size-6 items-center justify-center rounded-full', iso === today && 'bg-primary text-primary-foreground')}>
                        {dt.getDate()}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const row = grid.get(m.id)
                return (
                  <tr key={m.id}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-3 py-1.5 sm:px-4 text-left font-normal">
                      <div className="flex items-center gap-2">
                        <Avatar name={m.name} seed={m.id} size="xs" />
                        <span className="max-w-16 truncate text-[13px] font-medium sm:max-w-32">{m.name}</span>
                      </div>
                    </th>
                    {dates.map((iso) => {
                      const l = row?.get(iso)
                      const off = isOff(iso)
                      return (
                        <td key={iso} className={cn('h-10 border-b border-border p-0.5', off && 'bg-muted/60')}>
                          {l && !off && (
                            <Tooltip
                              content={`${l.leave_type.name} · ${l.status === 'pending' ? 'Pending' : 'Approved'}${l.is_half_day ? ` · ${l.half} half` : ''}`}
                            >
                              <div
                                role="img"
                                tabIndex={0}
                                aria-label={`${m.name}: ${l.leave_type.name} (${l.status})`}
                                className={cn('h-full rounded', l.is_half_day && (l.half === 'first' ? 'mr-[45%]' : 'ml-[45%]'))}
                                style={{
                                  background: l.status === 'approved' ? l.leave_type.color : `${l.leave_type.color}55`,
                                  boxShadow: l.status === 'pending' ? `inset 0 0 0 1px ${l.leave_type.color}` : undefined,
                                }}
                              />
                            </Tooltip>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
