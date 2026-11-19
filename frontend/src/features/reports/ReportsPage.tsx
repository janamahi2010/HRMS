import { BarChart3, CalendarDays, Download, ListChecks, Palmtree } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge, statusMeta } from '@/components/StatusBadge'
import { UserPicker, type PickedUser } from '@/components/UserPicker'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { useLocations } from '@/features/settings/api'
import { fmtMinutes, parseISODate, todayIST } from '@/lib/date'
import { exportExcel } from '@/lib/excel'
import { getErrorMessage } from '@/lib/errors'
import { useDailyReport, useLeaveReport, useSummaryReport, type DailyRow, type RangeFilters, type SummaryRow } from './api'

type Tab = 'summary' | 'daily' | 'leave'
type Preset = 'this_month' | 'last_month' | 'last_7' | 'last_30' | 'custom'
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function presetRange(p: Preset, today: Date): { from: string; to: string } | null {
  switch (p) {
    case 'this_month':
      return { from: iso(startOfMonth(today)), to: iso(today) }
    case 'last_month': {
      const lm = subMonths(today, 1)
      return { from: iso(startOfMonth(lm)), to: iso(endOfMonth(lm)) }
    }
    case 'last_7':
      return { from: iso(subDays(today, 6)), to: iso(today) }
    case 'last_30':
      return { from: iso(subDays(today, 29)), to: iso(today) }
    default:
      return null
  }
}

const dlabel = (s: string) => format(parseISODate(s), 'd MMM yyyy')

export default function ReportsPage() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [params, setParams] = useSearchParams()
  const tab = (['summary', 'daily', 'leave'].includes(params.get('tab') ?? '') ? params.get('tab') : 'summary') as Tab
  const today = parseISODate(todayIST())

  const [preset, setPreset] = useState<Preset>('this_month')
  const [range, setRange] = useState(() => presetRange('this_month', today)!)
  const [person, setPerson] = useState<PickedUser | null>(null)
  const [office, setOffice] = useState<string>('all')
  const [year, setYear] = useState(today.getFullYear())
  const [exporting, setExporting] = useState(false)
  const locations = useLocations()

  const filters: RangeFilters = { ...range, user: person?.id, office_location: office === 'all' ? undefined : Number(office) }
  const rangeValid = range.from && range.to && range.from <= range.to
  const summary = useSummaryReport(filters, tab === 'summary' && !!rangeValid)
  const daily = useDailyReport(filters, tab === 'daily' && !!rangeValid)
  const leave = useLeaveReport(year, person?.id, tab === 'leave')

  const choosePreset = (p: Preset) => {
    setPreset(p)
    const r = presetRange(p, today)
    if (r) setRange(r)
  }

  async function onExport() {
    setExporting(true)
    try {
      const span = `${range.from}_to_${range.to}`
      if (tab === 'summary' && summary.data) {
        await exportExcel(`attendance-summary_${span}`, [
          {
            name: 'Summary',
            rows: summary.data.results.map((r) => ({
              'Employee ID': r.user.employee_code ?? '',
              Employee: r.user.name,
              Email: r.user.email,
              Designation: r.user.designation,
              Office: r.office ?? '',
              Manager: r.manager ?? '',
              'Working days': r.working_days,
              'On time': r.present,
              Late: r.late,
              'Half-day': r.half_day,
              Incomplete: r.incomplete,
              Absent: r.absent,
              'On leave': r.on_leave,
              'Attendance %': r.attendance_rate ?? '',
              'Avg check-in': r.avg_check_in ?? '',
              'Total hours': Math.round((r.worked_minutes / 60) * 10) / 10,
              'Avg hours/day': Math.round((r.avg_minutes / 60) * 10) / 10,
            })),
          },
        ])
      } else if (tab === 'daily' && daily.data) {
        await exportExcel(`attendance-daily_${span}`, [
          {
            name: 'Daily log',
            rows: daily.data.results.map((r) => ({
              Date: r.date,
              'Employee ID': r.user.employee_code ?? '',
              Employee: r.user.name,
              Status: statusMeta(r.status).label,
              'Check in': r.check_in ?? '',
              'Check out': r.check_out ?? '',
              'Hours worked': r.worked_minutes ? Math.round((r.worked_minutes / 60) * 100) / 100 : '',
              'Distance (m)': r.distance_m ?? '',
              Office: r.office ?? '',
              Source: r.source ?? '',
              Remarks: r.remarks,
              'Work summary': r.work_summary,
            })),
          },
        ])
      } else if (tab === 'leave' && leave.data) {
        const types = leave.data.types
        await exportExcel(`leave-report_${year}`, [
          {
            name: 'Balances',
            rows: leave.data.results.map((r) => {
              const row: Record<string, string | number> = {
                'Employee ID': r.user.employee_code ?? '',
                Employee: r.user.name,
                Email: r.user.email,
              }
              for (const t of types) {
                const b = r.balances[t.id]
                if (t.is_paid) {
                  row[`${t.name} total`] = b?.total ?? 0
                  row[`${t.name} used`] = b?.used ?? 0
                  row[`${t.name} available`] = b?.available ?? 0
                } else row[`${t.name} taken`] = b?.used ?? 0
              }
              return row
            }),
          },
          {
            name: 'Requests',
            rows: leave.data.requests.map((r) => ({
              'Employee ID': r.user.employee_code ?? '',
              Employee: r.user.name,
              Type: r.leave_type,
              From: r.from_date,
              To: r.to_date,
              Days: r.days,
              Status: statusMeta(r.status).label,
              'Decided by': r.decided_by ?? '',
              'Applied on': r.applied_on.slice(0, 10),
              Reason: r.reason,
            })),
          },
        ])
      }
      toast.success('Excel file downloaded')
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the Excel file."))
    } finally {
      setExporting(false)
    }
  }

  const active = tab === 'summary' ? summary : tab === 'daily' ? daily : leave
  const canExport = !!active.data && !active.isFetching

  return (
    <>
      <PageHeader
        title="Reports"
        description={isAdmin ? 'Attendance and leave across the company.' : 'Attendance and leave for your team.'}
        actions={
          <Button variant="outline" onClick={onExport} loading={exporting} disabled={!canExport}>
            {!exporting && <Download />} Export Excel
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'summary' ? {} : { tab: v }, { replace: true })} className="mb-4">
        <TabsList aria-label="Reports">
          <TabsTrigger value="summary">
            <BarChart3 aria-hidden /> Attendance summary
          </TabsTrigger>
          <TabsTrigger value="daily">
            <ListChecks aria-hidden /> Daily log
          </TabsTrigger>
          <TabsTrigger value="leave">
            <Palmtree aria-hidden /> Leave
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
      {/* Filters: one row above the data */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        {tab !== 'leave' ? (
          <>
            <Select value={preset} onValueChange={(v) => choosePreset(v as Preset)}>
              <SelectTrigger className="lg:w-40" aria-label="Date range">
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="last_7">Last 7 days</SelectItem>
                <SelectItem value="last_30">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2 lg:flex">
              <Input
                type="date"
                aria-label="From"
                value={range.from}
                max={todayIST()}
                onChange={(e) => {
                  setPreset('custom')
                  setRange((r) => ({ ...r, from: e.target.value }))
                }}
                className="lg:w-40"
              />
              <Input
                type="date"
                aria-label="To"
                value={range.to}
                min={range.from}
                max={todayIST()}
                onChange={(e) => {
                  setPreset('custom')
                  setRange((r) => ({ ...r, to: e.target.value }))
                }}
                className="lg:w-40"
              />
            </div>
          </>
        ) : (
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="lg:w-32" aria-label="Year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[today.getFullYear() + 1, today.getFullYear(), today.getFullYear() - 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="lg:w-64">
          <UserPicker value={person} onChange={setPerson} placeholder="All people" />
        </div>
        {tab !== 'leave' && isAdmin && (locations.data?.length ?? 0) > 1 && (
          <Select value={office} onValueChange={setOffice}>
            <SelectTrigger className="lg:w-44" aria-label="Office">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offices</SelectItem>
              {locations.data!.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!rangeValid && tab !== 'leave' ? (
        <EmptyState icon={CalendarDays} title="Pick a valid date range" description="The start date must be on or before the end date." />
      ) : active.isError ? (
        <ErrorState error={active.error} onRetry={() => active.refetch()} retrying={active.isFetching} />
      ) : tab === 'summary' ? (
        <SummaryTable rows={summary.data?.results} loading={summary.isLoading} fetching={summary.isFetching} sub={summary.data ? `${dlabel(summary.data.from)} – ${dlabel(summary.data.to)} · ${summary.data.working_days} working days` : ''} />
      ) : tab === 'daily' ? (
        <DailyTable rows={daily.data?.results} loading={daily.isLoading} fetching={daily.isFetching} />
      ) : (
        <LeaveTable data={leave.data} loading={leave.isLoading} fetching={leave.isFetching} />
      )}
        </TabsContent>
      </Tabs>
    </>
  )
}

const Person = ({ u }: { u: { id: number; name: string; designation?: string; employee_code?: string } }) => (
  <div className="flex min-w-0 items-center gap-3">
    <Avatar name={u.name} seed={u.id} size="sm" />
    <div className="min-w-0">
      <p className="truncate font-medium">{u.name}</p>
      {(u.employee_code || u.designation) && (
        <p className="truncate text-xs text-muted-foreground">
          {u.employee_code && <span className="font-mono">{u.employee_code}</span>}
          {u.employee_code && u.designation && ' · '}
          {u.designation}
        </p>
      )}
    </div>
  </div>
)

function SummaryTable({ rows, loading, fetching, sub }: { rows?: SummaryRow[]; loading: boolean; fetching: boolean; sub: string }) {
  const totals = useMemo(() => {
    if (!rows?.length) return null
    const rated = rows.filter((r) => r.attendance_rate != null)
    return {
      rate: rated.length ? Math.round(rated.reduce((a, r) => a + r.attendance_rate!, 0) / rated.length) : null,
      late: rows.reduce((a, r) => a + r.late, 0),
      absent: rows.reduce((a, r) => a + r.absent, 0),
    }
  }, [rows])
  const n = (v: number) => <span className="tabular">{v || <span className="text-muted-foreground">0</span>}</span>
  const columns: Column<SummaryRow>[] = [
    { key: 'user', header: 'Employee', cell: (r) => <Person u={r.user} />, skeletonWidth: 'w-36' },
    {
      key: 'rate',
      header: 'Attendance',
      cell: (r) => <span className="tabular font-semibold">{r.attendance_rate != null ? `${r.attendance_rate}%` : '–'}</span>,
      skeletonWidth: 'w-12',
    },
    { key: 'present', header: 'On time', cell: (r) => n(r.present), skeletonWidth: 'w-8' },
    { key: 'late', header: 'Late', cell: (r) => n(r.late), skeletonWidth: 'w-8' },
    { key: 'half', header: 'Half-day', cell: (r) => n(r.half_day), skeletonWidth: 'w-8' },
    { key: 'absent', header: 'Absent', cell: (r) => n(r.absent + r.incomplete), skeletonWidth: 'w-8' },
    { key: 'leave', header: 'Leave', cell: (r) => n(r.on_leave), skeletonWidth: 'w-8' },
    { key: 'in', header: 'Avg in', cell: (r) => <span className="tabular">{r.avg_check_in ?? '–'}</span>, skeletonWidth: 'w-12' },
    { key: 'hours', header: 'Avg hours', cell: (r) => <span className="tabular">{r.avg_minutes ? fmtMinutes(r.avg_minutes) : '–'}</span>, skeletonWidth: 'w-12' },
  ]
  return (
    <div className="space-y-3">
      {sub && (
        <p className="text-[13px] text-muted-foreground">
          {sub}
          {totals && (
            <>
              {' '}
              · avg attendance <span className="font-medium text-foreground">{totals.rate ?? '–'}%</span> · {totals.late} late arrivals · {totals.absent} absences
            </>
          )}
          . Absent includes incomplete days.
        </p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.user.id}
        isLoading={loading}
        fetching={fetching && !loading}
        caption="Attendance summary"
        empty={<EmptyState icon={BarChart3} title="No data for this selection" />}
        mobileCard={(r) => (
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Person u={r.user} />
              <span className="tabular text-lg font-semibold">{r.attendance_rate != null ? `${r.attendance_rate}%` : '–'}</span>
            </div>
            <p className="tabular mt-2 text-xs text-muted-foreground">
              {r.present} on time · {r.late} late · {r.half_day} half · {r.absent + r.incomplete} absent · {r.on_leave} leave
              {r.avg_minutes ? ` · ${fmtMinutes(r.avg_minutes)}/day` : ''}
            </p>
          </div>
        )}
      />
    </div>
  )
}

function DailyTable({ rows, loading, fetching }: { rows?: DailyRow[]; loading: boolean; fetching: boolean }) {
  const [limit, setLimit] = useState(100)
  const shown = rows?.slice().reverse().slice(0, limit)
  const columns: Column<DailyRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => <span className="whitespace-nowrap font-medium">{format(parseISODate(r.date), 'EEE, d MMM')}</span>, skeletonWidth: 'w-24' },
    {
      key: 'user',
      header: 'Employee',
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.user.name}
          {r.user.employee_code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.user.employee_code}</span>}
        </span>
      ),
      skeletonWidth: 'w-28',
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, skeletonWidth: 'w-20' },
    { key: 'in', header: 'In', cell: (r) => <span className="tabular">{r.check_in ?? '–'}</span>, skeletonWidth: 'w-10' },
    { key: 'out', header: 'Out', cell: (r) => <span className="tabular">{r.check_out ?? '–'}</span>, skeletonWidth: 'w-10' },
    { key: 'worked', header: 'Worked', cell: (r) => <span className="tabular">{r.worked_minutes ? fmtMinutes(r.worked_minutes) : '–'}</span>, skeletonWidth: 'w-10' },
    { key: 'dist', header: 'Distance', cell: (r) => <span className="tabular">{r.distance_m != null ? `${r.distance_m} m` : '–'}</span>, skeletonWidth: 'w-10' },
    { key: 'remarks', header: 'Remarks', cell: (r) => <span className="text-muted-foreground">{r.remarks || '–'}</span>, className: 'max-w-40 truncate', skeletonWidth: 'w-24' },
    {
      key: 'summary',
      header: 'Work summary',
      cell: (r) =>
        r.work_summary ? (
          <p className="line-clamp-2 max-w-72 whitespace-pre-line text-[13px] leading-snug" title={r.work_summary}>
            {r.work_summary}
          </p>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
      skeletonWidth: 'w-40',
    },
  ]
  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        rows={shown}
        getRowId={(r) => `${r.user.id}-${r.date}`}
        isLoading={loading}
        fetching={fetching && !loading}
        caption="Daily attendance log"
        empty={<EmptyState icon={ListChecks} title="No attendance in this range" />}
        mobileCard={(r) => (
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {format(parseISODate(r.date), 'EEE, d MMM')}
                {r.check_in ? ` · ${r.check_in}–${r.check_out ?? '…'}` : ''}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        )}
      />
      {rows && rows.length > limit && (
        <div className="flex items-center justify-center gap-3 text-[13px] text-muted-foreground">
          Showing {limit} of {rows.length} rows (newest first). Export includes everything.
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 200)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  )
}

function LeaveTable({ data, loading, fetching }: { data?: ReturnType<typeof useLeaveReport>['data']; loading: boolean; fetching: boolean }) {
  const types = data?.types ?? []
  type Row = NonNullable<typeof data>['results'][number]
  const num = (v: number) => (Number.isInteger(v) ? v : v.toFixed(1))
  const columns: Column<Row>[] = [
    { key: 'user', header: 'Employee', cell: (r) => <Person u={r.user} />, skeletonWidth: 'w-36' },
    ...types.map<Column<Row>>((t) => ({
      key: `t${t.id}`,
      header: (
        <span className="inline-flex items-center gap-1.5 normal-case">
          <span className="size-2 rounded-full" style={{ background: t.color }} aria-hidden />
          {t.name.replace(/ Leave$/, '')}
        </span>
      ),
      cell: (r) => {
        const b = r.balances[t.id]
        if (!b) return '–'
        return t.is_paid ? (
          <span className="tabular">
            {num(b.used)} <span className="text-muted-foreground">/ {num(b.total)} used</span>
          </span>
        ) : (
          <span className="tabular">{num(b.used)} taken</span>
        )
      },
      skeletonWidth: 'w-16',
    })),
  ]
  return (
    <DataTable
      columns={columns}
      rows={data?.results}
      getRowId={(r) => r.user.id}
      isLoading={loading}
      fetching={fetching && !loading}
      caption="Leave balances report"
      empty={<EmptyState icon={Palmtree} title="No leave data" />}
      mobileCard={(r) => (
        <div className="p-4">
          <Person u={r.user} />
          <p className="tabular mt-2 text-xs text-muted-foreground">
            {types
              .map((t) => {
                const b = r.balances[t.id]
                return b ? `${t.name.replace(/ Leave$/, '')} ${num(b.used)}${t.is_paid ? `/${num(b.total)}` : ''}` : null
              })
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      )}
    />
  )
}
