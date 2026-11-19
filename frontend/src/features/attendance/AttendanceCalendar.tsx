import { CalendarDays, ChevronLeft, ChevronRight, List, NotebookPen } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type Column } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { statusMeta, StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtMinutes, fmtTime, parseISODate, todayIST } from '@/lib/date'
import type { CalendarDay, MonthCalendar } from '@/lib/types'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useUser } from '@/features/auth/AuthProvider'
import { useCalendar } from './api'
import { WorkSummaryEditor, WorkSummaryText } from './WorkSummary'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const CELL_TONE: Record<string, string> = {
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  orange: 'bg-orange-soft text-orange-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
  neutral: 'bg-muted/70 text-muted-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground',
  outline: 'ring-1 ring-inset ring-border text-foreground',
}

const LEGEND = ['present', 'late', 'half_day', 'absent', 'on_leave', 'incomplete', 'holiday', 'weekly_off'] as const

const SUMMARY_ITEMS: { key: keyof MonthCalendar['summary'] | 'attended'; label: string; tone: string }[] = [
  { key: 'attended', label: 'Present', tone: 'success' },
  { key: 'late', label: 'Late', tone: 'warning' },
  { key: 'half_day', label: 'Half-day', tone: 'orange' },
  { key: 'absent', label: 'Absent', tone: 'danger' },
  { key: 'on_leave', label: 'On leave', tone: 'info' },
  { key: 'avg_minutes', label: 'Avg / day', tone: 'primary' },
]

export function useMonthNav() {
  const now = parseISODate(todayIST())
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const isCurrent = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1
  const shift = (delta: number) =>
    setYm(({ year, month }) => {
      const m = month - 1 + delta
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 }
    })
  return { ...ym, isCurrent, prev: () => shift(-1), next: () => shift(1), reset: () => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 }) }
}

/** Month calendar + list for one user (defaults to me). */
export function AttendanceCalendar({ userId, showSummary = true, compact }: { userId?: number; showSummary?: boolean; compact?: boolean }) {
  const nav = useMonthNav()
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [selected, setSelected] = useState<CalendarDay | null>(null)
  const q = useCalendar(nav.year, nav.month, userId)
  const me = useUser()
  const title = format(new Date(nav.year, nav.month - 1, 1), 'MMMM yyyy')

  return (
    <div className="space-y-4">
      {showSummary && <MonthSummary data={q.data} loading={q.isLoading} />}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={nav.prev} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <h2 className="min-w-32 text-center text-sm font-semibold" aria-live="polite">
              {title}
            </h2>
            <Button variant="ghost" size="icon-sm" onClick={nav.next} disabled={nav.isCurrent} aria-label="Next month">
              <ChevronRight />
            </Button>
            {!nav.isCurrent && (
              <Button variant="link" size="sm" onClick={nav.reset} className="px-2">
                Today
              </Button>
            )}
          </div>
          {!compact && (
            <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="View">
              {(
                [
                  ['calendar', CalendarDays, 'Calendar'],
                  ['list', List, 'List'],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                    view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {q.isError ? (
          <ErrorState compact error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
        ) : view === 'calendar' || compact ? (
          <div className={cn('p-3 sm:p-4 transition-opacity', q.isFetching && !q.isLoading && 'opacity-60')}>
            <MonthGrid data={q.data} loading={q.isLoading} onSelect={setSelected} />
            <Legend />
          </div>
        ) : (
          <div className="p-3 sm:p-4">
            <DayList data={q.data} loading={q.isLoading} fetching={q.isFetching} onSelect={setSelected} />
          </div>
        )}
      </Card>

      <DayDetail
        day={selected ? q.data?.days.find((x) => x.date === selected.date) ?? selected : null}
        onClose={() => setSelected(null)}
        isSelf={!userId || userId === me.id}
      />
    </div>
  )
}

function MonthGrid({ data, loading, onSelect }: { data?: MonthCalendar; loading: boolean; onSelect: (d: CalendarDay) => void }) {
  const today = todayIST()
  const cells = useMemo(() => {
    if (!data) return []
    const first = parseISODate(data.days[0]!.date)
    const lead = (first.getDay() + 6) % 7 // Monday-first
    return [...Array<null>(lead).fill(null), ...data.days]
  }, [data])

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1.5 sm:gap-1.5" aria-hidden>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {loading || !data
          ? Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg sm:aspect-[4/3]" />)
          : cells.map((d, i) => {
              if (!d) return <div key={`pad-${i}`} />
              const meta = d.status ? statusMeta(d.status) : null
              const isToday = d.date === today
              const day = Number(d.date.slice(8))
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onSelect(d)}
                  aria-label={`${format(parseISODate(d.date), 'EEEE d MMMM')}: ${meta?.label ?? 'No record'}`}
                  className={cn(
                    'group relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm font-medium transition-[transform,box-shadow] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 sm:aspect-[4/3] sm:items-start sm:justify-between sm:p-2',
                    meta ? CELL_TONE[meta.tone] : 'text-muted-foreground hover:bg-muted/50',
                    isToday && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                  )}
                >
                  <span className="tabular">{day}</span>
                  {meta && (
                    <span className="hidden max-w-full truncate text-[11px] font-medium lg:block">
                      {d.status === 'holiday' && d.holiday_name ? d.holiday_name : meta.label}
                    </span>
                  )}
                  {d.record?.work_summary && (
                    <NotebookPen className="absolute right-1.5 top-1.5 size-3 opacity-70" aria-label="Has work summary" />
                  )}
                  {d.record?.check_in_at && (
                    <span className="hidden text-[11px] xl:block tabular">
                      {fmtTime(d.record.check_in_at).replace(' ', '')}
                      {d.record.check_out_at ? `–${fmtTime(d.record.check_out_at).replace(' ', '')}` : ''}
                    </span>
                  )}
                </button>
              )
            })}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Legend">
      {LEGEND.map((s) => {
        const m = statusMeta(s)
        return (
          <li key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-3 rounded', CELL_TONE[m.tone])} aria-hidden />
            {m.label}
          </li>
        )
      })}
    </ul>
  )
}

export function MonthSummary({ data, loading }: { data?: MonthCalendar; loading: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
      {SUMMARY_ITEMS.map((item) => {
        let value: string | number = '–'
        if (data) {
          const s = data.summary
          value =
            item.key === 'attended'
              ? s.present + s.late
              : item.key === 'avg_minutes'
                ? s.avg_minutes
                  ? fmtMinutes(s.avg_minutes)
                  : '–'
                : s[item.key]
        }
        return (
          <Card key={item.key} className="px-3 py-2.5">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-full', CELL_TONE[item.tone])} aria-hidden />
              {item.label}
            </p>
            {loading ? <Skeleton className="mt-1.5 h-6 w-10" /> : <p className="tabular mt-0.5 text-xl font-semibold">{value}</p>}
          </Card>
        )
      })}
    </div>
  )
}

function DayList({
  data,
  loading,
  fetching,
  onSelect,
}: {
  data?: MonthCalendar
  loading: boolean
  fetching: boolean
  onSelect: (d: CalendarDay) => void
}) {
  const rows = useMemo(() => (data ? data.days.filter((d) => d.status).reverse() : undefined), [data])
  const columns: Column<CalendarDay>[] = [
    { key: 'date', header: 'Date', cell: (d) => <span className="font-medium">{format(parseISODate(d.date), 'EEE, d MMM')}</span>, skeletonWidth: 'w-24' },
    { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status!} />, skeletonWidth: 'w-20' },
    { key: 'in', header: 'Check in', cell: (d) => <Time v={d.record?.check_in_at} />, skeletonWidth: 'w-16' },
    { key: 'out', header: 'Check out', cell: (d) => <Time v={d.record?.check_out_at} />, skeletonWidth: 'w-16' },
    {
      key: 'worked',
      header: 'Worked',
      cell: (d) => <span className="tabular">{d.record?.worked_minutes ? fmtMinutes(d.record.worked_minutes) : '–'}</span>,
      skeletonWidth: 'w-12',
    },
    {
      key: 'note',
      header: 'Note',
      cell: (d) => <span className="text-muted-foreground">{noteFor(d) || '–'}</span>,
      className: 'max-w-56 truncate',
      skeletonWidth: 'w-28',
    },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(d) => d.date}
      isLoading={loading}
      fetching={fetching && !loading}
      onRowClick={onSelect}
      caption="Attendance this month"
      empty={<EmptyState compact icon={CalendarDays} title="No attendance this month" description="Days appear here once they start." />}
      mobileCard={(d) => (
        <button type="button" onClick={() => onSelect(d)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
          <div className="min-w-0">
            <p className="text-sm font-medium">{format(parseISODate(d.date), 'EEE, d MMM')}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {d.record?.check_in_at
                ? `${fmtTime(d.record.check_in_at)} – ${d.record.check_out_at ? fmtTime(d.record.check_out_at) : '…'}${d.record.worked_minutes ? ` · ${fmtMinutes(d.record.worked_minutes)}` : ''}`
                : noteFor(d) || ' '}
            </p>
          </div>
          <StatusBadge status={d.status!} />
        </button>
      )}
    />
  )
}

const Time = ({ v }: { v?: string | null }) => <span className="tabular">{v ? fmtTime(v) : '–'}</span>

function noteFor(d: CalendarDay) {
  if (d.holiday_name) return d.holiday_name
  if (d.leave) return `${d.leave.type}${d.leave.is_half_day ? ` (${d.leave.half} half)` : ''}`
  return d.record?.remarks ?? ''
}

function DayDetail({ day, onClose, isSelf }: { day: CalendarDay | null; onClose: () => void; isSelf: boolean }) {
  const rec = day?.record
  const canRegularize =
    isSelf && day && day.date <= todayIST() && day.day_kind === 'working' && ['absent', 'incomplete', 'half_day', 'late', 'not_checked_in'].includes(day.status ?? '')
  const rows: [string, ReactNode][] = []
  if (day) {
    rows.push(['Status', day.status ? <StatusBadge status={day.status} /> : 'No record'])
    if (rec?.check_in_at) rows.push(['Check in', fmtTime(rec.check_in_at)])
    if (rec?.check_out_at) rows.push(['Check out', fmtTime(rec.check_out_at)])
    if (rec?.worked_minutes) rows.push(['Worked', fmtMinutes(rec.worked_minutes)])
    if (rec?.office) rows.push(['Office', rec.office])
    if (rec?.check_in_distance_m != null) rows.push(['Distance at check-in', `${Math.round(rec.check_in_distance_m)} m`])
    if (rec?.source === 'regularization') rows.push(['Source', 'Regularization'])
    if (noteFor(day)) rows.push(['Note', noteFor(day)])
  }
  const hasPunch = !!rec?.check_in_at

  return (
    <ResponsiveDialog
      open={!!day}
      onOpenChange={(o) => !o && onClose()}
      title={day ? format(parseISODate(day.date), 'EEEE, d MMMM yyyy') : ''}
      footer={
        canRegularize ? (
          <Button size="lg" className="md:h-10" asChild>
            <Link to={`/requests?new=1&date=${day!.date}`}>Request regularization</Link>
          </Button>
        ) : (
          <Button variant="outline" size="lg" className="md:h-10" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <dl className="divide-y divide-border rounded-xl border border-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {rec && hasPunch &&
          (isSelf ? (
            <WorkSummaryEditor key={rec.id} record={rec} date={day!.date} compact />
          ) : (
            <div className="rounded-xl border border-border p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <NotebookPen className="size-3.5" aria-hidden /> Work summary
              </p>
              <WorkSummaryText text={rec.work_summary} />
            </div>
          ))}
      </div>
    </ResponsiveDialog>
  )
}
