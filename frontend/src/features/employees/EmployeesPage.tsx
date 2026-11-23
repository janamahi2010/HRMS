import { KeyRound, MailPlus, MoreHorizontal, Pencil, Plus, UserCheck, UserRound, UserX, Users } from 'lucide-react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { prefetchPerson } from './profileApi'
import { DataTable, type Column, type SortState } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUser } from '@/features/auth/AuthProvider'
import { fmtDate } from '@/lib/date'
import type { Employee } from '@/lib/types'
import { useEmployees, useResendInvite, useSetEmployeeActive, type EmployeeFilters } from './api'
import { EmployeeFormDialog } from './EmployeeFormDialog'
import { InternshipBadge } from './Internship'
import { SetPasswordDialog } from './AdminPassword'

const INITIAL: EmployeeFilters = { search: '', role: 'all', status: 'active', sort: '', page: 1 }

/** Phone "Sort by" menu (the table headers do this on wider screens). */
const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: 'designation', label: 'Designation' },
  { value: 'role', label: 'Role' },
  { value: 'manager', label: 'Reports to' },
  { value: 'location', label: 'Office' },
  { value: '-joined', label: 'Joined (newest)' },
  { value: 'joined', label: 'Joined (oldest)' },
  { value: 'status', label: 'Status' },
]

export default function EmployeesPage() {
  const me = useUser()
  // Filters live in the URL, so returning from a profile restores the same search and page.
  const [params, setParams] = useSearchParams()
  const filters: EmployeeFilters = {
    search: params.get('q') ?? INITIAL.search,
    role: (params.get('role') as EmployeeFilters['role']) ?? INITIAL.role,
    status: (params.get('status') as EmployeeFilters['status']) ?? INITIAL.status,
    sort: params.get('sort') ?? INITIAL.sort,
    page: Number(params.get('page')) || INITIAL.page,
  }
  const setFilters = (next: EmployeeFilters | ((f: EmployeeFilters) => EmployeeFilters)) => {
    const f = typeof next === 'function' ? next(filters) : next
    const p = new URLSearchParams()
    if (f.search) p.set('q', f.search)
    if (f.role !== INITIAL.role) p.set('role', f.role)
    if (f.status !== INITIAL.status) p.set('status', f.status)
    if (f.sort) p.set('sort', f.sort)
    if (f.page !== 1) p.set('page', String(f.page))
    setParams(p, { replace: true })
  }
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const openProfile = (e: Employee) => navigate(`/employees/${e.id}`, { state: { from: location.pathname + location.search } })
  const warm = (e: Employee) => void prefetchPerson(qc, e.id)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirm, setConfirm] = useState<Employee | null>(null)
  const [pwFor, setPwFor] = useState<Employee | null>(null)
  const query = useEmployees(filters)
  const setActive = useSetEmployeeActive()
  const resend = useResendInvite()

  const update = (patch: Partial<EmployeeFilters>) => setFilters((f) => ({ ...f, page: 1, ...patch }))
  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (e: Employee) => {
    setEditing(e)
    setFormOpen(true)
  }
  // Default order is name A-Z, so show that arrow when nothing is picked.
  const sort: SortState = filters.sort
    ? { key: filters.sort.replace(/^-/, ''), desc: filters.sort.startsWith('-') }
    : { key: 'name', desc: false }
  // Click a header: A-Z, then Z-A, then back to the default (name A-Z).
  const onSort = (key: string) => {
    const next = sort.key !== key ? key : !sort.desc ? `-${key}` : ''
    update({ sort: next === 'name' ? '' : next })
  }
  const isFiltered = filters.search !== '' || filters.role !== 'all' || filters.status !== 'active'

  const actions = (e: Employee) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.name}`} onClick={(ev) => ev.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
        <DropdownMenuItem onSelect={() => openProfile(e)}>
          <UserRound /> View profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPwFor(e)}>
          <KeyRound /> Reset password
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEdit(e)}>
          <Pencil /> Edit details
        </DropdownMenuItem>
        {e.is_active && (
          <DropdownMenuItem onSelect={() => resend.mutate(e.id)}>
            <MailPlus /> {e.invite_pending ? 'Resend invite' : 'Send password link'}
          </DropdownMenuItem>
        )}
        {e.id !== me.id && (
          <>
            <DropdownMenuSeparator />
            {e.is_active ? (
              <DropdownMenuItem destructive onSelect={() => setConfirm(e)}>
                <UserX /> Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setActive.mutate({ id: e.id, active: true })}>
                <UserCheck /> Activate
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const statusBadge = (e: Employee) =>
    !e.is_active ? (
      <StatusBadge status="inactive" />
    ) : e.invite_pending ? (
      <Badge tone="warning" dot>
        Invite pending
      </Badge>
    ) : (
      <StatusBadge status="active" />
    )

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortable: true,
      skeletonWidth: 'w-40',
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={e.name} seed={e.id} src={e.avatar_url} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {e.name}
              {e.id === me.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">
              {e.employee_code && <span className="font-mono text-xs tracking-tight text-foreground/70">{e.employee_code} · </span>}
              {e.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      sortable: true,
      cell: (e) => <span className="text-muted-foreground">{e.designation || '—'}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      skeletonWidth: 'w-16',
      cell: (e) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={e.role} dot={false} />
          {e.internship && <InternshipBadge internship={e.internship} />}
          {e.password_change_pending && <Badge tone="warning">Default password</Badge>}
          {e.remote_allowed && <Badge tone="info">Remote</Badge>}
        </div>
      ),
    },
    {
      key: 'manager',
      header: 'Reports to',
      sortable: true,
      cell: (e) => <span className="text-muted-foreground">{e.manager?.name ?? '—'}</span>,
    },
    {
      key: 'location',
      header: 'Office',
      sortable: true,
      cell: (e) => <span className="text-muted-foreground">{e.office_location?.name ?? '—'}</span>,
    },
    {
      key: 'joined',
      header: 'Joined',
      sortable: true,
      cell: (e) => <span className="tabular text-muted-foreground">{e.joining_date ? fmtDate(e.joining_date) : '—'}</span>,
    },
    { key: 'status', header: 'Status', sortable: true, skeletonWidth: 'w-16', cell: statusBadge },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-12 text-right', cell: actions },
  ]

  return (
    <>
      <PageHeader
        title="Employees"
        description={query.data ? `${query.data.count} ${filters.status === 'active' ? 'active ' : ''}people` : 'Manage your team'}
        actions={
          <Button onClick={openCreate} className="max-sm:w-full" size="lg">
            <Plus /> Add employee
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={filters.search}
          onChange={(search) => update({ search })}
          placeholder="Search name, ID, email or designation"
          className="sm:max-w-sm sm:flex-1"
        />
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select value={filters.role} onValueChange={(v) => update({ role: v as EmployeeFilters['role'] })}>
            <SelectTrigger className="sm:w-36" aria-label="Filter by role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="employee">Employees</SelectItem>
              <SelectItem value="intern">Interns</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => update({ status: v as EmployeeFilters['status'] })}>
            <SelectTrigger className="sm:w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.sort || 'name'} onValueChange={(v) => update({ sort: v === 'name' ? '' : v })}>
            <SelectTrigger className="col-span-2 md:hidden" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  Sort: {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
        </Card>
      ) : (
        <>
          <DataTable
            caption="Employees"
            columns={columns}
            rows={query.data?.results}
            getRowId={(e) => e.id}
            isLoading={query.isPending}
            fetching={query.isPlaceholderData}
            onRowClick={openProfile}
            onRowIntent={warm}
            sort={sort}
            onSort={onSort}
            mobileCard={(e) => (
              <Card className="flex items-center gap-3 p-4" onClick={() => openProfile(e)} onPointerEnter={() => warm(e)}>
                <Avatar name={e.name} seed={e.id} src={e.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{e.name}</p>
                    {e.role !== 'employee' && <StatusBadge status={e.role} dot={false} />}
                    {e.internship && <InternshipBadge internship={e.internship} />}
                  </div>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {e.employee_code && <span className="font-mono text-xs tracking-tight text-foreground/70">{e.employee_code} · </span>}
                    {e.designation || e.email}
                  </p>
                  <div className="mt-1.5">{statusBadge(e)}</div>
                </div>
                {actions(e)}
              </Card>
            )}
            empty={
              isFiltered ? (
                <EmptyState
                  icon={Users}
                  title="No matching employees"
                  description="Try a different search or clear the filters."
                  action={
                    <Button variant="outline" onClick={() => setFilters(INITIAL)}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No employees yet"
                  description="Add your team so they can check in and apply for leave."
                  action={
                    <Button onClick={openCreate}>
                      <Plus /> Add employee
                    </Button>
                  }
                />
              )
            }
          />
          {query.data && (
            <Pagination
              page={query.data.page}
              totalPages={query.data.total_pages}
              count={query.data.count}
              pageSize={query.data.page_size}
              onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
              fetching={query.isPlaceholderData}
            />
          )}
        </>
      )}

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} />
      <SetPasswordDialog open={!!pwFor} onOpenChange={(o) => !o && setPwFor(null)} employee={pwFor} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Deactivate ${confirm?.name ?? ''}?`}
        description="They’ll be signed out immediately and won’t be able to log in. Their attendance and leave history is kept, and you can reactivate them anytime."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          if (confirm) setActive.mutate({ id: confirm.id, active: false })
          setConfirm(null)
        }}
      />
    </>
  )
}
