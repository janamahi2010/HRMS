import { ChevronLeft, ChevronRight, UserRound, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { DataTable, type Column } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SearchInput } from '@/components/SearchInput'
import { statusMeta, StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { fmtMinutes, fmtTime, parseISODate, todayIST } from '@/lib/date'
import type { TeamDayRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTeamDay } from './api'
import { AttendanceCalendar } from './AttendanceCalendar'

const ORDER = ['present', 'late', 'half_day', 'incomplete', 'not_checked_in', 'absent', 'on_leave', 'holiday', 'weekly_off']

const shiftDate = (iso: string, days: number) => {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return format(d, 'yyyy-MM-dd')
}

const NO_SUMMARY = '__no_summary'

export function TeamAttendance() {
  const today = todayIST()
  const [date, setDate] = useState(today)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [viewing, setViewing] = useState<TeamDayRow | null>(null)
  const q = useTeamDay(date, search)

  // People who worked that day (punched in, or a regularized WFH/visit day) but wrote no work summary.
  const missingNote = (r: TeamDayRow) => !!r.record?.check_in_at && !r.record.work_summary.trim()
  const missingCount = useMemo(() => q.data?.results.filter(missingNote).length ?? 0, [q.data])
  const rows = useMemo(
    () =>
      q.data?.results.filter((r) =>
        status === NO_SUMMARY ? missingNote(r) : !status || (r.status ?? 'none') === status,
      ),
    [q.data, status],
  )
  const chips = useMemo(
    () =>
      Object.entries(q.data?.summary ?? {})
        .filter(([k]) => k !== 'none')
        .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b)),
    [q.data],
  )

  const columns: Column<TeamDayRow>[] = [
    {
      key: 'user',
      header: 'Employee',
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.user.name} seed={r.user.id} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.user.designation || r.user.email}</p>
          </div>
        </div>
      ),
      skeletonWidth: 'w-40',
    },
    { key: 'status', header: 'Status', cell: (r) => (r.status ? <StatusBadge status={r.status} /> : '–'), skeletonWidth: 'w-20' },
    { key: 'in', header: 'Check in', cell: (r) => <T v={r.record?.check_in_at} />, skeletonWidth: 'w-16' },
    { key: 'out', header: 'Check out', cell: (r) => <T v={r.record?.check_out_at} />, skeletonWidth: 'w-16' },
    {
      key: 'worked',
      header: 'Worked',
      cell: (r) => <span className="tabular">{r.record?.worked_minutes ? fmtMinutes(r.record.worked_minutes) : '–'}</span>,
      skeletonWidth: 'w-12',
    },
    {
      key: 'where',
      header: 'Location',
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.record?.check_in_distance_m != null
            ? `${Math.round(r.record.check_in_distance_m)} m from ${r.record.office ?? 'office'}`
            : r.leave
              ? r.leave.type
              : r.user.office ?? '–'}
        </span>
      ),
      skeletonWidth: 'w-28',
    },
    {
      key: 'summary',
      header: 'Work summary',
      cell: (r) =>
        r.record?.work_summary ? (
          <p className="line-clamp-2 max-w-80 whitespace-pre-line text-[13px] leading-snug" title={r.record.work_summary}>
            {r.record.work_summary}
          </p>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
      skeletonWidth: 'w-40',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)}
            className="w-44"
            aria-label="Date"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => shiftDate(d, 1))}
            disabled={date >= today}
            aria-label="Next day"
          >
            <ChevronRight />
          </Button>
          {date !== today && (
            <Button variant="link" size="sm" onClick={() => setDate(today)}>
              Today
            </Button>
          )}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search people…" className="sm:w-64" aria-label="Search people" />
      </div>

      {chips.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by status">
          <Chip active={!status} onClick={() => setStatus(null)} label="All" count={q.data?.total ?? 0} />
          {chips.map(([k, n]) => (
            <Chip key={k} active={status === k} onClick={() => setStatus(status === k ? null : k)} label={statusMeta(k).label} count={n} />
          ))}
          {(missingCount > 0 || status === NO_SUMMARY) && (
            <>
              <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden />
              <Chip
                active={status === NO_SUMMARY}
                onClick={() => setStatus(status === NO_SUMMARY ? null : NO_SUMMARY)}
                label="No work summary"
                count={missingCount}
              />
            </>
          )}
        </div>
      )}

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.user.id}
          isLoading={q.isLoading}
          fetching={q.isFetching && !q.isLoading}
          onRowClick={setViewing}
          caption={`Team attendance on ${date}`}
          empty={
            <EmptyState
              icon={Users}
              title={status === NO_SUMMARY ? 'Everyone has written a summary' : search || status ? 'No one matches' : 'No team members yet'}
              description={
                status === NO_SUMMARY
                  ? 'Nobody who worked this day is missing a work summary.'
                  : search || status
                    ? 'Try a different search or status.'
                    : 'People who report to you will appear here.'
              }
            />
          }
          mobileCard={(r) => (
            <button type="button" onClick={() => setViewing(r)} className="flex w-full items-center gap-3 p-4 text-left">
              <Avatar name={r.user.name} seed={r.user.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.record?.check_in_at
                    ? `${fmtTime(r.record.check_in_at)} – ${r.record.check_out_at ? fmtTime(r.record.check_out_at) : '…'}`
                    : r.leave?.type ?? r.user.designation}
                </p>
                {r.record?.work_summary && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-foreground/90">{r.record.work_summary}</p>
                )}
              </div>
              {r.status && <StatusBadge status={r.status} />}
            </button>
          )}
        />
      )}

      <ResponsiveDialog
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.user.name ?? ''}
        description={viewing?.user.designation || viewing?.user.email}
        className="md:max-w-3xl"
      >
        {viewing && (
          <div className="space-y-3">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/employees/${viewing.user.id}`} state={{ from: '/attendance?tab=team' }}>
                <UserRound /> View full profile
              </Link>
            </Button>
            <AttendanceCalendar userId={viewing.user.id} compact />
          </div>
        )}
      </ResponsiveDialog>
    </div>
  )
}

const T = ({ v }: { v?: string | null }) => <span className="tabular">{v ? fmtTime(v) : '–'}</span>

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        active ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('tabular rounded-full px-1.5 text-xs', active ? 'bg-primary/15' : 'bg-muted')}>{count}</span>
    </button>
  )
}
