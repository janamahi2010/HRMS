import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CalendarHeart,
  Clock,
  Inbox,
  Palmtree,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { StatCard, StatCardSkeleton } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckInCard, CheckInCardSkeleton } from '@/features/attendance/CheckInCard'
import { useUser } from '@/features/auth/AuthProvider'
import { fmtMinutes, fmtRelative, greeting, nowIST, parseISODate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useDashboard, type DashboardData } from './api'
import { BirthdayBanner } from '@/features/celebrations/BirthdayBanner'
import { UpcomingBirthdays } from '@/features/celebrations/UpcomingBirthdays'
import { HolidaysDialog } from './HolidaysDialog'
import { TrendChart } from './TrendChart'
import { InternshipBadge } from '@/features/employees/Internship'
import { NewsHomeCard } from '@/features/news/NewsHomeCard'
import { ForgotCheckout, MissedCheckoutBanner } from './MissedCheckout'

const dshort = (iso: string) => format(parseISODate(iso), 'd MMM')
const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

export default function DashboardPage() {
  const user = useUser()
  const q = useDashboard()
  const d = q.data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {greeting()}, {user.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{format(nowIST(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      <BirthdayBanner ready={!!d} />
      {d && d.me.missed_checkouts.length > 0 && <MissedCheckoutBanner days={d.me.missed_checkouts} />}

      {q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
        </Card>
      ) : (
        <>
          {d?.company && d.company.no_office > 0 && (
            <Link
              to="/employees"
              className="flex items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground transition-opacity hover:opacity-90"
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                {d.company.no_office} active {d.company.no_office === 1 ? 'person has' : 'people have'} no office location, so they can't check in.
              </span>
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6">
            {d ? <CheckInCard /> : <CheckInCardSkeleton />}
            <div className="space-y-4">
              <MonthStats d={d} />
              {d?.team ? <TeamToday d={d} /> : <Balances d={d} />}
            </div>
          </div>

          {d?.company && (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Active employees" value={d.company.active} icon={Users} hint={`${d.company.managers} managers`} />
              <StatCard label="Joined this month" value={d.company.joiners} icon={UserPlus} tone="success" />
              <StatCard
                label="Pending approvals"
                value={(d.team?.pending.leave ?? 0) + (d.team?.pending.regularization ?? 0)}
                icon={Inbox}
                tone="warning"
                hint={`${d.team?.pending.leave ?? 0} leave · ${d.team?.pending.regularization ?? 0} regularization`}
              />
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
            <div className="space-y-4 lg:col-span-2">
              {d && <NewsHomeCard />}
              {d?.company && d.company.trend.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <div>
                      <CardTitle className="text-[15px]">Attendance rate · last {d.company.trend.length} working days</CardTitle>
                      <p className="mt-1 text-[13px] text-muted-foreground">Share of expected people who checked in. Leave doesn't count against it.</p>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <TrendChart data={d.company.trend} />
                  </CardContent>
                </Card>
              )}
              {d?.team && <Approvals d={d} />}
              {d?.team && d.team.internships.length > 0 && <InternshipsDue items={d.team.internships} />}
              {d?.team && d.team.forgot_checkout.length > 0 && <ForgotCheckout items={d.team.forgot_checkout} canOpen={d.role === 'admin' || d.role === 'manager'} />}
              {d?.team && <Balances d={d} />}
              {d && !d.team && <MyRequests d={d} />}
            </div>
            <div className="space-y-4">
              <OnLeaveCard d={d} />
              <UpcomingBirthdays />
              <HolidaysCard d={d} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MonthStats({ d }: { d?: DashboardData }) {
  if (!d)
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    )
  const m = d.me.month
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard label="Present" value={m.present} icon={UserCheck} tone="success" hint={m.half_day ? `+${m.half_day} half-day` : 'this month'} />
      <StatCard label="Late" value={m.late} icon={Clock} tone="warning" hint="this month" />
      <StatCard label="Absent" value={m.absent} icon={UserX} tone="danger" hint={m.incomplete ? `+${m.incomplete} incomplete` : 'this month'} />
      <StatCard label="Avg. day" value={m.avg_minutes ? fmtMinutes(m.avg_minutes) : '–'} icon={CalendarCheck2} tone="info" hint="hours worked" />
    </div>
  )
}

const TEAM_ORDER: { key: string; label: string; dot: string }[] = [
  { key: 'present', label: 'Present', dot: 'bg-success' },
  { key: 'late', label: 'Late', dot: 'bg-warning' },
  { key: 'half_day', label: 'Half-day', dot: 'bg-orange' },
  { key: 'incomplete', label: 'Incomplete', dot: 'bg-orange' },
  { key: 'not_checked_in', label: 'Not in yet', dot: 'bg-muted-foreground' },
  { key: 'absent', label: 'Absent', dot: 'bg-danger' },
  { key: 'on_leave', label: 'On leave', dot: 'bg-info' },
  { key: 'holiday', label: 'Holiday', dot: 'bg-neutral' },
  { key: 'weekly_off', label: 'Weekly off', dot: 'bg-neutral' },
]

function TeamToday({ d }: { d: DashboardData }) {
  const t = d.team!
  const items = TEAM_ORDER.filter((i) => (t.today[i.key as keyof typeof t.today] ?? 0) > 0)
  return (
    <Section
      title={d.role === 'admin' ? 'Company today' : 'Your team today'}
      action={
        <Link to="/attendance?tab=team" className="text-[13px] font-medium text-primary hover:underline">
          View all
        </Link>
      }
    >
      {t.size === 0 ? (
        <EmptyState compact icon={Users} title="No direct reports yet" />
      ) : (
        <>
          {/* One stacked bar: share of team per status, labelled in the legend below. */}
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
            {items.map((i) => (
              <div key={i.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', i.dot)} style={{ flexGrow: t.today[i.key as keyof typeof t.today] }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-2 text-sm">
                <span className={cn('size-2.5 rounded-full', i.dot)} aria-hidden />
                <span className="text-muted-foreground">{i.label}</span>
                <span className="tabular font-semibold">{t.today[i.key as keyof typeof t.today]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

function Balances({ d }: { d?: DashboardData }) {
  return (
    <Section
      title={d?.role === 'intern' ? 'Leaves taken' : 'Leave balance'}
      action={
        <Link to="/leave" className="text-[13px] font-medium text-primary hover:underline">
          Apply leave
        </Link>
      }
    >
      {!d ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {d.me.balances.map((b) => (
            <div key={b.leave_type.id} className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ background: b.leave_type.color }} aria-hidden />
                {b.leave_type.for_interns ? 'This year' : b.leave_type.name.replace(/ Leave$/, '')}
              </p>
              <p className="tabular mt-0.5 text-lg font-semibold">
                {b.leave_type.is_paid ? n1(b.available) : n1(b.used)}
                <span className="text-xs font-normal text-muted-foreground"> {b.leave_type.is_paid ? `/ ${n1(b.total)}` : 'taken'}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function InternshipsDue({ items }: { items: NonNullable<DashboardData['team']>['internships'] }) {
  return (
    <Section title="Internships ending soon">
      <ul className="-mx-2 divide-y divide-border">
        {items.map((i) => (
          <li key={i.user.id}>
            <Link
              to={`/employees/${i.user.id}`}
              state={{ from: '/' }}
              className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
            >
              <Avatar name={i.user.name} seed={i.user.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {i.user.designation || 'Intern'}
                  {i.end ? ` · ${i.status === 'ended' ? 'ended' : 'ends'} ${dshort(i.end)}` : ''}
                </p>
              </div>
              <InternshipBadge internship={i} />
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {items.some((i) => i.status === 'ended') && (
        <p className="mt-3 text-[13px] text-muted-foreground">Ended internships stay active until you extend the end date, change the role or deactivate them.</p>
      )}
    </Section>
  )
}

function Approvals({ d }: { d: DashboardData }) {
  const items = d.team!.approvals
  return (
    <Section title="Waiting for your approval">
      {items.length === 0 ? (
        <EmptyState compact icon={Inbox} title="You're all caught up" description="New requests from your team will show up here." />
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {items.map((a) => (
            <li key={`${a.kind}-${a.id}`}>
              <Link
                to={a.kind === 'leave' ? '/leave?tab=approvals' : '/requests?tab=approvals'}
                className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
              >
                <Avatar name={a.user.name} seed={a.user.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.title} · {a.from_date === a.to_date ? dshort(a.from_date) : `${dshort(a.from_date)} – ${dshort(a.to_date)}`}
                  </p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">{fmtRelative(a.created_at)}</span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function MyRequests({ d }: { d: DashboardData }) {
  const { pending, upcoming_leave } = d.me
  return (
    <Section title="Upcoming leave & requests">
      {(pending.leave > 0 || pending.regularization > 0) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pending.leave > 0 && (
            <Link to="/leave" className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-soft-foreground">
              {pending.leave} leave pending
            </Link>
          )}
          {pending.regularization > 0 && (
            <Link to="/requests" className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-soft-foreground">
              {pending.regularization} regularization pending
            </Link>
          )}
        </div>
      )}
      {upcoming_leave.length === 0 ? (
        <EmptyState
          compact
          icon={Palmtree}
          title="No upcoming leave"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/leave">Plan time off</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {upcoming_leave.map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="h-8 w-1 rounded-full" style={{ background: l.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.type}</p>
                <p className="text-xs text-muted-foreground">
                  {l.from_date === l.to_date ? dshort(l.from_date) : `${dshort(l.from_date)} – ${dshort(l.to_date)}`} · {n1(l.days)}{' '}
                  {l.days === 1 ? 'day' : 'days'}
                </p>
              </div>
              <StatusBadge status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function OnLeaveCard({ d }: { d?: DashboardData }) {
  return (
    <Section title={`On leave today${d && d.on_leave_count ? ` · ${d.on_leave_count}` : ''}`}>
      {!d ? (
        <ListSkeleton />
      ) : d.on_leave_today.length === 0 ? (
        <EmptyState compact icon={Palmtree} title="Everyone's in today" />
      ) : (
        <ul className="space-y-3">
          {d.on_leave_today.map((e) => (
            <li key={e.user.id} className="flex items-center gap-3">
              <Avatar name={e.user.name} seed={e.user.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.is_half_day ? `${e.half === 'first' ? 'First' : 'Second'} half` : `Back after ${dshort(e.to_date)}`}
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden />
                {e.type.replace(/ Leave$/, '')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function HolidaysCard({ d }: { d?: DashboardData }) {
  const [open, setOpen] = useState(false)
  return (
    <Section
      title="Upcoming holidays"
      action={
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen(true)}>
          View all
        </Button>
      }
    >
      <HolidaysDialog open={open} onOpenChange={setOpen} />
      {!d ? (
        <ListSkeleton />
      ) : d.holidays.length === 0 ? (
        <EmptyState compact icon={CalendarHeart} title="No holidays scheduled" />
      ) : (
        <ul className="space-y-3">
          {d.holidays.map((h) => {
            const dt = parseISODate(h.date)
            return (
              <li key={h.date} className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <span className="text-[10px] font-semibold uppercase leading-none">{format(dt, 'MMM')}</span>
                  <span className="tabular text-sm font-semibold leading-tight">{format(dt, 'd')}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{format(dt, 'EEEE')}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
