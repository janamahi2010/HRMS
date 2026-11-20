import { Check, ClipboardList, Inbox, Plus, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { DataTable, type Column } from '@/components/DataTable'
import { DecisionDialog } from '@/components/DecisionDialog'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthProvider'
import { fmtDateTime, fmtRelative, parseISODate } from '@/lib/date'
import type { Regularization, RequestStatus } from '@/lib/types'
import { useRegularizationAction, useRegularizations, type RegFilters, type RegScope } from './api'
import { REG_TYPES, RegularizationFormDialog } from './RegularizationFormDialog'

const day = (iso: string) => format(parseISODate(iso), 'EEE, d MMM yyyy')
const to12 = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const range = (r: Regularization) => `${to12(r.check_in_time)} – ${to12(r.check_out_time)}`

function TypeLabel({ r }: { r: Regularization }) {
  const t = REG_TYPES.find((x) => x.value === r.type)
  return (
    <span className="inline-flex items-center gap-1.5">
      {t && <t.icon className="size-4 text-muted-foreground" aria-hidden />}
      {r.type_label}
    </span>
  )
}

export default function RequestsPage() {
  const { hasRole } = useAuth()
  const isApprover = hasRole('admin', 'manager')
  const [params, setParams] = useSearchParams()
  const scope: RegScope = isApprover && (params.get('tab') === 'approvals' || params.get('tab') === 'team') ? (params.get('tab') as RegScope) : 'mine'
  const [formOpen, setFormOpen] = useState(false)
  const [initialDate, setInitialDate] = useState<string | null>(null)

  // Deep link from the attendance calendar: /requests?new=1&date=YYYY-MM-DD
  useEffect(() => {
    if (params.get('new') === '1') {
      setInitialDate(params.get('date'))
      setFormOpen(true)
      const next = new URLSearchParams(params)
      next.delete('new')
      next.delete('date')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  // Pending count for the Approvals tab badge (cheap: page_size is server default, we only read count).
  const pending = useRegularizations({ scope: 'approvals', status: 'pending', search: '', page: 1 })
  const pendingCount = isApprover ? pending.data?.count ?? 0 : 0

  return (
    <>
      <PageHeader
        title="Requests"
        description="Attendance regularization: missed punches, work from home and client visits."
        actions={
          <Button
            onClick={() => {
              setInitialDate(null)
              setFormOpen(true)
            }}
          >
            <Plus /> New request
          </Button>
        }
      />
      {isApprover ? (
        <Tabs value={scope} onValueChange={(v) => setParams(v === 'mine' ? {} : { tab: v }, { replace: true })}>
          <TabsList aria-label="Request views">
            <TabsTrigger value="mine">
              <ClipboardList aria-hidden /> My requests
            </TabsTrigger>
            <TabsTrigger value="approvals">
              <Inbox aria-hidden /> Approvals
              {pendingCount > 0 && (
                <Badge tone="primary" className="ml-0.5 px-1.5 py-0 tabular">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="team">
              <Users aria-hidden /> {hasRole('admin') ? 'All requests' : 'Team'}
            </TabsTrigger>
          </TabsList>
          <TabsContent value={scope}>
            <RequestList key={scope} scope={scope} onNew={() => setFormOpen(true)} />
          </TabsContent>
        </Tabs>
      ) : (
        <RequestList key={scope} scope={scope} onNew={() => setFormOpen(true)} />
      )}
      <RegularizationFormDialog open={formOpen} onOpenChange={setFormOpen} initialDate={initialDate} />
    </>
  )
}

export function RequestList({ scope, onNew, userId }: { scope: RegScope; onNew?: () => void; userId?: number }) {
  const [filters, setFilters] = useState<RegFilters>({ scope, status: scope === 'approvals' ? 'pending' : 'all', search: '', page: 1, user: userId })
  const q = useRegularizations(filters)
  const act = useRegularizationAction()
  const [detail, setDetail] = useState<Regularization | null>(null)
  const [decision, setDecision] = useState<{ r: Regularization; mode: 'approve' | 'reject' } | null>(null)
  const [cancelling, setCancelling] = useState<Regularization | null>(null)
  const showUser = scope !== 'mine' && !userId
  const update = (p: Partial<RegFilters>) => setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }))

  // Keep the open detail in sync after an action.
  const live = detail ? q.data?.results.find((r) => r.id === detail.id) ?? detail : null

  const actions = (r: Regularization, size: 'sm' | 'default' = 'sm') => (
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

  const columns: Column<Regularization>[] = [
    ...(showUser
      ? [
          {
            key: 'user',
            header: 'Employee',
            cell: (r: Regularization) => (
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
    { key: 'date', header: 'Date', cell: (r) => <span className="font-medium">{day(r.date)}</span>, skeletonWidth: 'w-28' },
    { key: 'type', header: 'Type', cell: (r) => <TypeLabel r={r} />, skeletonWidth: 'w-24' },
    { key: 'time', header: 'Time', cell: (r) => <span className="tabular whitespace-nowrap">{range(r)}</span>, skeletonWidth: 'w-32' },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, skeletonWidth: 'w-20' },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (r) => <span className="text-muted-foreground">{fmtRelative(r.created_at)}</span>,
      skeletonWidth: 'w-16',
    },
    { key: 'actions', header: <span className="sr-only">Actions</span>, cell: (r) => actions(r), skeletonWidth: 'w-16' },
  ]

  const emptyCopy = {
    mine: { icon: ClipboardList, title: 'No requests yet', description: 'Missed a punch or worked remotely? Raise a request and your approver will review it.' },
    approvals: { icon: Inbox, title: "You're all caught up", description: 'No requests are waiting for your approval.' },
    team: { icon: Users, title: 'No requests', description: 'Requests from your team will appear here.' },
  }[scope]
  const filtered = filters.status !== (scope === 'approvals' ? 'pending' : 'all') || !!filters.search

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {showUser && (
          <SearchInput value={filters.search} onChange={(search) => update({ search })} placeholder="Search by name or reason…" className="sm:w-72" aria-label="Search requests" />
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

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : (
        <DataTable
          columns={columns}
          rows={q.data?.results}
          getRowId={(r) => r.id}
          isLoading={q.isLoading}
          fetching={q.isPlaceholderData}
          onRowClick={setDetail}
          caption="Regularization requests"
          empty={
            <EmptyState
              icon={filtered ? ClipboardList : emptyCopy.icon}
              title={filtered ? 'No matching requests' : emptyCopy.title}
              description={filtered ? 'Try a different filter.' : emptyCopy.description}
              action={
                scope === 'mine' && !filtered && onNew ? (
                  <Button onClick={onNew}>
                    <Plus /> New request
                  </Button>
                ) : undefined
              }
            />
          }
          mobileCard={(r) => (
            <div className="space-y-3 p-4" onClick={() => setDetail(r)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {showUser && <Avatar name={r.user.name} seed={r.user.id} src={r.user.avatar_url} size="sm" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{showUser ? r.user.name : day(r.date)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {showUser ? `${day(r.date)} · ` : ''}
                      {r.type_label} · {range(r)}
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

      <RequestDetail r={live} onClose={() => setDetail(null)} actions={actions} />

      <DecisionDialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        mode={decision?.mode ?? 'approve'}
        title={decision ? `${decision.mode === 'approve' ? 'Approve' : 'Reject'} ${decision.r.type_label.toLowerCase()}?` : ''}
        summary={decision && <Summary r={decision.r} />}
        loading={act.isPending}
        onConfirm={(comment) =>
          decision &&
          act.mutate({ id: decision.r.id, action: decision.mode, comment }, { onSuccess: () => setDecision(null), onSettled: () => setDecision(null) })
        }
      />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this request?"
        description={cancelling ? `${cancelling.type_label} for ${day(cancelling.date)} will be withdrawn.` : ''}
        confirmLabel="Cancel request"
        cancelLabel="Keep"
        destructive
        loading={act.isPending}
        onConfirm={() => cancelling && act.mutate({ id: cancelling.id, action: 'cancel' }, { onSettled: () => setCancelling(null) })}
      />
    </div>
  )
}

function Summary({ r }: { r: Regularization }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3 text-sm">
      <p className="font-medium">
        {r.user.name} · {day(r.date)}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {r.type_label} · {range(r)}
      </p>
      <p className="mt-2 whitespace-pre-line">{r.reason}</p>
    </div>
  )
}

function RequestDetail({
  r,
  onClose,
  actions,
}: {
  r: Regularization | null
  onClose: () => void
  actions: (r: Regularization, size?: 'sm' | 'default') => React.ReactNode
}) {
  const rows: [string, React.ReactNode][] = r
    ? [
        ['Employee', r.user.name],
        ['Date', day(r.date)],
        ['Type', <TypeLabel key="t" r={r} />],
        ['Requested time', range(r)],
        ['Attendance now', r.attendance_status ? <StatusBadge key="s" status={r.attendance_status} /> : 'No record'],
        ['Status', <StatusBadge key="st" status={r.status} />],
        ['Approver', r.approver?.name ?? 'Admins'],
        ['Submitted', fmtDateTime(r.created_at)],
      ]
    : []
  if (r?.decided_by) rows.push([r.status === 'approved' ? 'Approved by' : 'Rejected by', `${r.decided_by.name} · ${fmtDateTime(r.decided_at!)}`])
  return (
    <ResponsiveDialog
      open={!!r}
      onOpenChange={(o) => !o && onClose()}
      title={r ? `${r.type_label} · ${format(parseISODate(r.date), 'd MMM')}` : ''}
      footer={r && (r.can_decide || r.can_cancel) ? actions(r, 'default') : undefined}
    >
      {r && (
        <div className="space-y-4">
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
        </div>
      )}
    </ResponsiveDialog>
  )
}
