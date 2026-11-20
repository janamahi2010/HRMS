import { Check, Inbox, Mail, Palmtree, Plus, Users, X, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { DataTable, type Column } from '@/components/DataTable'
import { DecisionDialog } from '@/components/DecisionDialog'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Pagination } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtDateTime, fmtRelative, parseISODate } from '@/lib/date'
import type { LeaveRequest, RequestStatus } from '@/lib/types'
import { useLeaveAction, useLeaveRequests, type LeaveFilters, type LeaveScope } from './api'

const d = (iso: string) => format(parseISODate(iso), 'd MMM')
const dy = (iso: string) => format(parseISODate(iso), 'EEE, d MMM yyyy')
export const leaveRange = (r: Pick<LeaveRequest, 'from_date' | 'to_date' | 'is_half_day' | 'half'>) =>
  r.is_half_day
    ? `${format(parseISODate(r.from_date), 'EEE, d MMM')} · ${r.half === 'first' ? 'First' : 'Second'} half`
    : r.from_date === r.to_date
      ? format(parseISODate(r.from_date), 'EEE, d MMM')
      : `${d(r.from_date)} – ${d(r.to_date)}`
const days = (n: string) => {
  const v = Number(n)
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${v === 1 ? 'day' : 'days'}`
}

function TypeChip({ r }: { r: LeaveRequest }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2.5 rounded-full" style={{ background: r.leave_type.color }} aria-hidden />
      {r.leave_type.name}
    </span>
  )
}

const EMPTY: Record<LeaveScope, { icon: LucideIcon; title: string; description: string }> = {
  mine: { icon: Palmtree, title: 'No leave requests yet', description: 'Plan some time off. Your requests and their status will show up here.' },
  approvals: { icon: Inbox, title: "You're all caught up", description: 'No leave requests are waiting for you.' },
  team: { icon: Users, title: 'No leave requests', description: "Your team's leave requests will appear here." },
  cc: { icon: Mail, title: "Nothing you're CC'd on", description: "When someone CCs you on a leave request, you'll see it here." },
}

export function LeaveRequestList({ scope, onApply, userId }: { scope: LeaveScope; onApply?: () => void; userId?: number }) {
  const [filters, setFilters] = useState<LeaveFilters>({ scope, status: scope === 'approvals' ? 'pending' : 'all', search: '', page: 1, user: userId })
  const q = useLeaveRequests(filters)
  const act = useLeaveAction()
  const [detailId, setDetailId] = useState<number | null>(null)
  const [decision, setDecision] = useState<{ r: LeaveRequest; mode: 'approve' | 'reject' } | null>(null)
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null)
  // On a single person's profile, the employee column and search are noise.
  const showUser = scope !== 'mine' && !userId
  const update = (p: Partial<LeaveFilters>) => setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }))
  const detail = q.data?.results.find((r) => r.id === detailId) ?? null

  const actions = (r: LeaveRequest, size: 'sm' | 'default' = 'sm') => (
    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {r.can_decide && (
        <>
          <Button size={size} variant="soft" className="bg-success-soft text-success-soft-foreground hover:bg-success-soft" onClick={() => setDecision({ r, mode: 'approve' })}>
            <Check /> Approve
          </Button>
          <Button size={size} variant="ghost" className="text-destructive" onClick={() => setDecision({ r, mode: 'reject' })}>
            <X /> Reject
          </Button>
        </>
      )}
      {r.can_cancel && (
        <Button size={size} variant="ghost" onClick={() => setCancelling(r)}>
          Cancel
        </Button>
      )}
    </div>
  )

  const columns: Column<LeaveRequest>[] = [
    ...(showUser
      ? [
          {
            key: 'user',
            header: 'Employee',
            cell: (r: LeaveRequest) => (
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={r.user.name} seed={r.user.id} src={r.user.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.user.designation || r.user.email}</p>
                </div>
              </div>
            ),
            skeletonWidth: 'w-36',
          },
        ]
      : []),
    { key: 'type', header: 'Type', cell: (r) => <TypeChip r={r} />, skeletonWidth: 'w-28' },
    { key: 'dates', header: 'Dates', cell: (r) => <span className="whitespace-nowrap font-medium">{leaveRange(r)}</span>, skeletonWidth: 'w-32' },
    { key: 'days', header: 'Days', cell: (r) => <span className="tabular">{days(r.days)}</span>, skeletonWidth: 'w-12' },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, skeletonWidth: 'w-20' },
    { key: 'applied', header: 'Applied', cell: (r) => <span className="text-muted-foreground">{fmtRelative(r.created_at)}</span>, skeletonWidth: 'w-16' },
    { key: 'actions', header: <span className="sr-only">Actions</span>, cell: (r) => actions(r), skeletonWidth: 'w-16' },
  ]

  const filtered = filters.status !== (scope === 'approvals' ? 'pending' : 'all') || !!filters.search
  const empty = EMPTY[scope]

  return (
    <div className="space-y-4">
      {
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {showUser && (
            <SearchInput value={filters.search} onChange={(search) => update({ search })} placeholder="Search by name or reason…" className="sm:w-72" aria-label="Search leave requests" />
          )}
          {scope !== 'approvals' && (
            <Select value={filters.status} onValueChange={(v) => update({ status: v as RequestStatus | 'all' })}>
              <SelectTrigger className="sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      }

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : (
        <DataTable
          columns={columns}
          rows={q.data?.results}
          getRowId={(r) => r.id}
          isLoading={q.isLoading}
          fetching={q.isPlaceholderData}
          onRowClick={(r) => setDetailId(r.id)}
          caption="Leave requests"
          empty={
            <EmptyState
              icon={empty.icon}
              title={filtered ? 'No matching requests' : empty.title}
              description={filtered ? 'Try a different filter.' : empty.description}
              action={
                scope === 'mine' && !filtered && onApply ? (
                  <Button onClick={onApply}>
                    <Plus /> Apply for leave
                  </Button>
                ) : undefined
              }
            />
          }
          mobileCard={(r) => (
            <div className="space-y-3 p-4" onClick={() => setDetailId(r.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {showUser ? (
                    <Avatar name={r.user.name} seed={r.user.id} src={r.user.avatar_url} size="sm" />
                  ) : (
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.leave_type.color }} aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{showUser ? r.user.name : r.leave_type.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {showUser ? `${r.leave_type.name} · ` : ''}
                      {leaveRange(r)} · {days(r.days)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {(r.can_decide || r.can_cancel) && actions(r, 'default')}
            </div>
          )}
        />
      )}
      {q.data && q.data.total_pages > 1 && (
        <Pagination
          page={q.data.page}
          totalPages={q.data.total_pages}
          count={q.data.count}
          pageSize={q.data.page_size}
          onPageChange={(page) => update({ page })}
          fetching={q.isPlaceholderData}
        />
      )}

      <LeaveDetail r={detail} onClose={() => setDetailId(null)} footer={detail && (detail.can_decide || detail.can_cancel) ? actions(detail, 'default') : undefined} />

      <DecisionDialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        mode={decision?.mode ?? 'approve'}
        title={decision ? `${decision.mode === 'approve' ? 'Approve' : 'Reject'} ${decision.r.user.name.split(' ')[0]}'s leave?` : ''}
        summary={
          decision && (
            <div className="rounded-xl bg-muted/60 p-3 text-sm">
              <p className="font-medium">
                <TypeChip r={decision.r} /> · {days(decision.r.days)}
              </p>
              <p className="mt-0.5 text-muted-foreground">{leaveRange(decision.r)}</p>
              <p className="mt-2 whitespace-pre-line">{decision.r.reason}</p>
            </div>
          )
        }
        loading={act.isPending}
        onConfirm={(comment) => decision && act.mutate({ id: decision.r.id, action: decision.mode, comment }, { onSettled: () => setDecision(null) })}
      />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this leave?"
        description={cancelling ? `${cancelling.leave_type.name}, ${leaveRange(cancelling)}. ${days(cancelling.days)} will go back to your balance.` : ''}
        confirmLabel="Cancel leave"
        cancelLabel="Keep"
        destructive
        loading={act.isPending}
        onConfirm={() => cancelling && act.mutate({ id: cancelling.id, action: 'cancel' }, { onSettled: () => setCancelling(null) })}
      />
    </div>
  )
}

function LeaveDetail({ r, onClose, footer }: { r: LeaveRequest | null; onClose: () => void; footer?: ReactNode }) {
  const rows: [string, ReactNode][] = []
  if (r) {
    rows.push(['Employee', r.user.name], ['Type', <TypeChip key="t" r={r} />])
    rows.push(['From', dy(r.from_date)])
    if (!r.is_half_day && r.to_date !== r.from_date) rows.push(['To', dy(r.to_date)])
    if (r.is_half_day) rows.push(['Session', r.half === 'first' ? 'First half' : 'Second half'])
    rows.push(['Days', days(r.days)], ['Status', <StatusBadge key="s" status={r.status} />], ['Approver', r.approver?.name ?? 'Admins'])
    rows.push(['Applied', fmtDateTime(r.created_at)])
    if (r.decided_by) rows.push([r.status === 'approved' ? 'Approved by' : 'Rejected by', `${r.decided_by.name} · ${fmtDateTime(r.decided_at!)}`])
  }
  return (
    <ResponsiveDialog open={!!r} onOpenChange={(o) => !o && onClose()} title={r ? `${r.leave_type.name} · ${leaveRange(r)}` : ''} footer={footer}>
      {r && (
        <div className="space-y-4">
          {r.is_cc && (
            <p className="rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-soft-foreground">You're CC'd on this request (view only).</p>
          )}
          <dl className="divide-y divide-border rounded-xl border border-border">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason</p>
            <p className="whitespace-pre-line text-sm">{r.reason}</p>
          </div>
          {r.decision_comment && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approver's comment</p>
              <p className="whitespace-pre-line text-sm">{r.decision_comment}</p>
            </div>
          )}
          {r.cc_users.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">CC</p>
              <div className="flex flex-wrap gap-2">
                {r.cc_users.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-xs font-medium">
                    <Avatar name={u.name} seed={u.id} size="xs" />
                    {u.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ResponsiveDialog>
  )
}
