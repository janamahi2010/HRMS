import {
  ArrowLeft,
  Briefcase,
  KeyRound,
  Cake,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  Clock,
  History,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Send,
  UserCheck,
  UserRound,
  Users,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { differenceInMonths, format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { StatCard, StatCardSkeleton } from '@/components/StatCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AttendanceCalendar } from '@/features/attendance/AttendanceCalendar'
import { useLeaveTypes } from '@/features/leave/api'
import { AdjustDialog, type BalanceRow } from '@/features/leave/BalancesAdmin'
import { LeaveRequestList } from '@/features/leave/LeaveRequestList'
import { BalanceCards } from '@/features/leave/LeaveWidgets'
import { RequestList } from '@/features/regularization/RequestsPage'
import { fmtDate, fmtDateTime, fmtMinutes, fmtRelative, fmtTime, parseISODate, todayIST } from '@/lib/date'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useResendInvite, useSetEmployeeActive } from './api'
import { SetPasswordDialog } from './AdminPassword'
import { EmployeeFormDialog } from './EmployeeFormDialog'
import { InternshipBadge, InternshipCard } from './Internship'
import { prefetchPerson, usePersonActivity, usePersonOverview, type PersonOverview } from './profileApi'

const TABS = [
  { value: 'overview', label: 'Overview', icon: UserRound },
  { value: 'attendance', label: 'Attendance', icon: CalendarCheck2 },
  { value: 'leave', label: 'Leave', icon: CalendarDays },
  { value: 'requests', label: 'Requests', icon: Clock },
  { value: 'activity', label: 'Activity', icon: History },
] as const
type Tab = (typeof TABS)[number]['value']

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

function tenure(joined: string | null): string | null {
  if (!joined) return null
  const months = differenceInMonths(parseISODate(todayIST()), parseISODate(joined))
  if (months < 1) return 'Joined this month'
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(' ')
}

export default function EmployeeProfilePage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview') as Tab
  const q = usePersonOverview(id)
  const d = q.data

  // Back returns to wherever you came from (keeps the Employees list's search/filters), else the list.
  const goBack = () => ((location.state as { from?: string } | null)?.from ? navigate(-1) : navigate('/employees'))

  if (q.isError) {
    return (
      <>
        <BackButton onClick={goBack} />
        <Card>
          <ErrorState error={q.error} title="We couldn't open this profile" onRetry={() => q.refetch()} retrying={q.isFetching} />
        </Card>
      </>
    )
  }

  return (
    <>
      <BackButton onClick={goBack} />
      {d ? <ProfileHeader d={d} /> : <HeaderSkeleton />}

      <Tabs
        value={tab}
        // Keep the navigation state (where we came from) when switching tabs, so Back still returns there.
        onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true, state: location.state })}
        className="mt-6"
      >
        <TabsList aria-label="Profile sections" className="max-w-full overflow-x-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden /> {label}
              {value === 'leave' && d && d.pending.leave > 0 && (
                <Badge tone="warning" className="ml-0.5 px-1.5 py-0 tabular">
                  {d.pending.leave}
                </Badge>
              )}
              {value === 'requests' && d && d.pending.regularization > 0 && (
                <Badge tone="warning" className="ml-0.5 px-1.5 py-0 tabular">
                  {d.pending.regularization}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">{d ? <Overview d={d} /> : <OverviewSkeleton />}</TabsContent>
        <TabsContent value="attendance">
          <AttendanceCalendar userId={id} />
        </TabsContent>
        <TabsContent value="leave">{d && <LeaveTab d={d} />}</TabsContent>
        <TabsContent value="requests">{d && <RequestList key={id} scope={d.is_self ? 'mine' : 'team'} userId={d.is_self ? undefined : id} />}</TabsContent>
        <TabsContent value="activity">
          <ActivityTab id={id} active={tab === 'activity'} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 mb-3 text-muted-foreground" onClick={onClick}>
      <ArrowLeft /> Back
    </Button>
  )
}

// ---------------------------------------------------------------- header

function ProfileHeader({ d }: { d: PersonOverview }) {
  const p = d.profile
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const setActive = useSetEmployeeActive()
  const resend = useResendInvite()

  // The edit dialog works on the list's Employee shape.
  const asEmployee: Employee = {
    ...p,
    ...(d.editable ?? {}),
    manager: p.manager && { id: p.manager.id, name: p.manager.name, email: p.manager.email, designation: p.manager.designation },
    direct_reports: d.direct_reports.filter((r) => r.is_active).length,
  }

  return (
    <Card className="overflow-hidden">
      <div className="h-16 bg-linear-to-r from-primary-soft via-primary-soft/60 to-transparent sm:h-20" aria-hidden />
      <div className="-mt-10 px-5 pb-5 sm:-mt-12 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <Avatar name={p.name} seed={p.id} size="xl" className="size-20 shrink-0 text-2xl ring-4 ring-card" />
            <div className="min-w-0 pb-1">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{p.name}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {p.employee_code && <span className="font-mono text-[13px] text-foreground/70">{p.employee_code} · </span>}
                {p.designation || 'No designation'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={p.role} dot={false} />
                {p.internship && <InternshipBadge internship={p.internship} />}
                <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                {p.invite_pending && <Badge tone="warning">Invite pending</Badge>}
                {p.password_change_pending && <Badge tone="warning">Default password</Badge>}
                {p.remote_allowed && <Badge tone="info">Can check in remotely</Badge>}
                {d.is_self && <Badge tone="outline">You</Badge>}
              </div>
            </div>
          </div>
          {d.can_manage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
              {!d.is_self && (
                <Button variant="outline" onClick={() => setPwOpen(true)}>
                  <KeyRound /> Reset password
                </Button>
              )}
              {p.invite_pending && p.is_active && (
                <Button variant="outline" onClick={() => resend.mutate(p.id)} loading={resend.isPending}>
                  {!resend.isPending && <Send />} Resend invite
                </Button>
              )}
              {!d.is_self &&
                (p.is_active ? (
                  <Button variant="outline" className="text-destructive" onClick={() => setConfirm(true)}>
                    <UserX /> Deactivate
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setActive.mutate({ id: p.id, active: true })} loading={setActive.isPending}>
                    {!setActive.isPending && <UserCheck />} Activate
                  </Button>
                ))}
            </div>
          )}
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact icon={Mail} label="Email">
            <a href={`mailto:${p.email}`} className="truncate text-primary hover:underline">
              {p.email}
            </a>
          </Fact>
          <Fact icon={Phone} label="Phone">
            {p.phone ? (
              <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="text-primary hover:underline">
                {p.phone}
              </a>
            ) : (
              '—'
            )}
          </Fact>
          <Fact icon={Users} label="Reports to">
            {p.manager ? <PersonLink id={p.manager.id} name={p.manager.name} /> : '—'}
          </Fact>
          <Fact icon={MapPin} label="Office">
            {p.office_location?.name ?? <span className="text-warning-soft-foreground">Not assigned (can't check in)</span>}
          </Fact>
          <Fact icon={Briefcase} label="Joined">
            {p.joining_date ? `${fmtDate(p.joining_date)} · ${tenure(p.joining_date)}` : '—'}
          </Fact>
          <Fact icon={Cake} label="Birthday">
            {p.birthday ? format(new Date(2000, Number(p.birthday.slice(0, 2)) - 1, Number(p.birthday.slice(3))), 'd MMMM') : '—'}
          </Fact>
          <Fact icon={Clock} label="Last sign-in">
            {p.last_login ? fmtRelative(p.last_login) : 'Never'}
          </Fact>
        </dl>
      </div>

      {d.can_manage && (
        <>
          <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={asEmployee} />
          <SetPasswordDialog open={pwOpen} onOpenChange={setPwOpen} employee={{ id: p.id, name: p.name, email: p.email }} />
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={`Deactivate ${p.name}?`}
            description="They'll be signed out everywhere and won't be able to log in. Their history stays in reports, and you can reactivate them any time."
            confirmLabel="Deactivate"
            destructive
            loading={setActive.isPending}
            onConfirm={() => setActive.mutate({ id: p.id, active: false }, { onSettled: () => setConfirm(false) })}
          />
        </>
      )}
    </Card>
  )
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <dt className="flex w-[7.5rem] shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </dt>
      <dd className="min-w-0 truncate font-medium">{children}</dd>
    </div>
  )
}

/** Name that opens that person's profile (only rendered where the viewer may see them). */
function PersonLink({ id, name }: { id: number; name: string }) {
  const qc = useQueryClient()
  const location = useLocation()
  return (
    <Link
      to={`/employees/${id}`}
      state={{ from: location.pathname }}
      onPointerEnter={() => void prefetchPerson(qc, id)}
      className="text-primary hover:underline"
    >
      {name}
    </Link>
  )
}

function HeaderSkeleton() {
  return (
    <Card className="overflow-hidden" aria-busy="true" aria-label="Loading profile">
      <div className="h-16 bg-muted/40 sm:h-20" />
      <div className="-mt-10 px-5 pb-5 sm:-mt-12 sm:px-6">
        <div className="flex items-end gap-4">
          <Skeleton className="size-20 rounded-full ring-4 ring-card" />
          <div className="space-y-2 pb-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- overview

function Overview({ d }: { d: PersonOverview }) {
  const m = d.month
  const t = d.today
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance" value={m.attendance_rate != null ? `${m.attendance_rate}%` : '–'} icon={UserCheck} tone="success" hint="this month" />
        <StatCard label="Late" value={m.late} icon={Clock} tone="warning" hint="this month" />
        <StatCard label="Absent" value={m.absent} icon={UserX} tone="danger" hint={m.incomplete ? `+${m.incomplete} incomplete` : 'this month'} />
        <StatCard label="Avg. day" value={m.avg_minutes ? fmtMinutes(m.avg_minutes) : '–'} icon={CalendarCheck2} tone="info" hint="hours worked" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Today">
            {t ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <StatusBadge status={t.status} />
                  <span>
                    In <b className="tabular">{t.check_in_at ? fmtTime(t.check_in_at) : '–'}</b>
                  </span>
                  <span>
                    Out <b className="tabular">{t.check_out_at ? fmtTime(t.check_out_at) : '–'}</b>
                  </span>
                  {t.worked_minutes > 0 && <span className="tabular">{fmtMinutes(t.worked_minutes)} worked</span>}
                </div>
                {t.work_summary && (
                  <p className="whitespace-pre-line rounded-lg bg-muted/60 p-3 text-sm">{t.work_summary}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No attendance recorded yet today.</p>
            )}
          </Section>

          <Section title={d.profile.role === 'intern' ? 'Leaves taken' : 'Leave balance'} action={<span className="text-xs text-muted-foreground">{format(new Date(), 'yyyy')}</span>}>
            {d.balances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No balances for this year.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {d.balances.map((b) => (
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
            {d.upcoming_leave.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-border pt-3">
                {d.upcoming_leave.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 text-sm">
                    <span className="h-6 w-1 rounded-full" style={{ background: l.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {l.type} · {l.from_date === l.to_date ? fmtDate(l.from_date) : `${fmtDate(l.from_date)} – ${fmtDate(l.to_date)}`}
                    </span>
                    <StatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          {d.profile.internship && <InternshipCard internship={d.profile.internship} />}
          <Section title="Reporting line">
            {d.chain.length === 0 ? (
              <p className="text-sm text-muted-foreground">Doesn't report to anyone.</p>
            ) : (
              <ol className="space-y-2">
                {[...d.chain].reverse().map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={c.name} seed={c.id} size="xs" />
                    <span className="min-w-0 truncate">{c.name}</span>
                    <StatusBadge status={c.role} dot={false} className="ml-auto" />
                  </li>
                ))}
                <li className="flex items-center gap-2 text-sm font-semibold">
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  {d.profile.name}
                </li>
              </ol>
            )}
          </Section>

          {(d.direct_reports.length > 0 || d.profile.role !== 'employee') && (
            <Section title={`Direct reports · ${d.direct_reports.filter((r) => r.is_active).length}`}>
              {d.direct_reports.length === 0 ? (
                <EmptyState compact icon={Users} title="No direct reports" />
              ) : (
                <ul className="-mx-2">
                  {d.direct_reports.map((r) => (
                    <li key={r.id}>
                      <ReportRow r={r} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section title="Account">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Added</dt>
                <dd className="text-right">{fmtDateTime(d.profile.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Password</dt>
                <dd className="text-right">{d.profile.invite_pending ? 'Not set yet (invite pending)' : 'Set'}</dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  )
}

function ReportRow({ r }: { r: PersonOverview['direct_reports'][number] }) {
  const qc = useQueryClient()
  const location = useLocation()
  return (
    <Link
      to={`/employees/${r.id}`}
      state={{ from: location.pathname }}
      onPointerEnter={() => void prefetchPerson(qc, r.id)}
      className={cn('flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50', !r.is_active && 'opacity-60')}
    >
      <Avatar name={r.name} seed={r.id} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.name}</p>
        <p className="truncate text-xs text-muted-foreground">{r.is_active ? r.designation || '—' : 'Inactive'}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
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

// ---------------------------------------------------------------- leave

function LeaveTab({ d }: { d: PersonOverview }) {
  const types = useLeaveTypes()
  const [adjusting, setAdjusting] = useState(false)
  const id = d.profile.id
  const row: BalanceRow = {
    user: { id, name: d.profile.name, email: d.profile.email, designation: d.profile.designation },
    balances: Object.fromEntries(d.balances.map((b) => [String(b.leave_type.id), { total: b.total, used: b.used, available: b.available }])),
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{d.profile.role === 'intern' ? 'Leaves taken' : 'Balances'}</h2>
        {d.can_manage && d.profile.role !== 'intern' && (
          <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
            <Wallet /> Adjust balance
          </Button>
        )}
      </div>
      <BalanceCards userId={d.is_self ? undefined : id} />
      <h2 className="pt-2 text-[15px] font-semibold">Leave requests</h2>
      <LeaveRequestList key={id} scope={d.is_self ? 'mine' : 'team'} userId={d.is_self ? undefined : id} />
      {d.can_manage && (
        <AdjustDialog
          row={adjusting ? row : null}
          types={(types.data ?? []).filter((t) => t.is_active)}
          year={Number(todayIST().slice(0, 4))}
          onClose={() => setAdjusting(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- activity

const ACTIVITY_TONE: Record<string, string> = {
  user_created: 'bg-success',
  joined: 'bg-success',
  user_activated: 'bg-success',
  user_deactivated: 'bg-danger',
  user_updated: 'bg-info',
  leave_balance_adjusted: 'bg-warning',
  attendance_regularized: 'bg-primary',
}

function ActivityTab({ id, active }: { id: number; active: boolean }) {
  const q = usePersonActivity(id, active)
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data)
    return (
      <Card className="space-y-4 p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="mt-1 size-2.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </Card>
    )
  if (q.data.length === 0)
    return (
      <Card>
        <EmptyState icon={History} title="No activity yet" description="Changes to this person's account and balances will appear here." />
      </Card>
    )
  return (
    <Card className="p-5">
      <ol className="relative space-y-5 border-l border-border pl-6">
        {q.data.map((a) => (
          <li key={a.id} className="relative">
            <span className={cn('absolute -left-[1.85rem] top-1.5 size-2.5 rounded-full ring-4 ring-card', ACTIVITY_TONE[a.action] ?? 'bg-muted-foreground')} aria-hidden />
            <p className="text-sm font-medium">{a.label}</p>
            {a.message && <p className="mt-0.5 text-sm text-muted-foreground">{a.message}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {a.actor ? `${a.actor.name} · ` : ''}
              <time dateTime={a.created_at} title={fmtDateTime(a.created_at)}>
                {fmtRelative(a.created_at)}
              </time>
            </p>
          </li>
        ))}
      </ol>
    </Card>
  )
}

