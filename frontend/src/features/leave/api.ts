import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import type {
  BalanceOverview,
  LeaveBalance,
  LeavePreview,
  LeaveRequest,
  LeaveType,
  OnLeaveEntry,
  Paginated,
  RequestStatus,
  TeamLeaveCalendar,
} from '@/lib/types'

export type LeaveScope = 'mine' | 'approvals' | 'team' | 'cc'

export interface LeaveFilters {
  scope: LeaveScope
  status: RequestStatus | 'all'
  search: string
  page: number
  /** Only this person's requests (employee profile page). */
  user?: number
}

export const leaveKeys = {
  all: ['leave'] as const,
  types: ['leave', 'types'] as const,
  balances: (user?: number, year?: number) => ['leave', 'balances', user ?? 'me', year ?? 'current'] as const,
  overview: (year: number, search: string, page: number) => ['leave', 'overview', year, search, page] as const,
  requests: (f: LeaveFilters) => ['leave', 'requests', f] as const,
  onLeave: (date?: string) => ['leave', 'on-leave', date ?? 'today'] as const,
  calendar: (y: number, m: number) => ['leave', 'calendar', y, m] as const,
  adjustments: (user: number) => ['leave', 'adjustments', user] as const,
}

export const fetchLeaveTypes = () => api.get<LeaveType[]>('/leave/types/').then((r) => r.data)

export function useLeaveTypes() {
  return useQuery({ queryKey: leaveKeys.types, queryFn: fetchLeaveTypes, staleTime: 5 * 60_000 })
}

export function useBalances(user?: number, year?: number) {
  return useQuery({
    queryKey: leaveKeys.balances(user, year),
    queryFn: () => api.get<LeaveBalance[]>('/leave/balances/', { params: { user, year } }).then((r) => r.data),
  })
}

export function useBalanceOverview(year: number, search: string, page: number) {
  return useQuery({
    queryKey: leaveKeys.overview(year, search, page),
    queryFn: ({ signal }) =>
      api.get<BalanceOverview>('/leave/balances/overview/', { params: { year, search: search || undefined, page }, signal }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useAdjustments(user: number | undefined) {
  return useQuery({
    queryKey: leaveKeys.adjustments(user ?? 0),
    queryFn: () =>
      api
        .get<{ id: number; message: string; actor: string | null; created_at: string }[]>('/leave/balances/adjustments/', { params: { user } })
        .then((r) => r.data),
    enabled: !!user,
  })
}

export function useLeaveRequests(f: LeaveFilters) {
  return useQuery({
    queryKey: leaveKeys.requests(f),
    queryFn: ({ signal }) =>
      api
        .get<Paginated<LeaveRequest>>('/leave/requests/', {
          params: { scope: f.scope, status: f.status === 'all' ? undefined : f.status, search: f.search || undefined, page: f.page, user: f.user },
          signal,
        })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export function useOnLeave(date?: string) {
  return useQuery({
    queryKey: leaveKeys.onLeave(date),
    queryFn: () => api.get<{ date: string; results: OnLeaveEntry[] }>('/leave/on-leave/', { params: { date } }).then((r) => r.data),
  })
}

export function useTeamLeaveCalendar(year: number, month: number) {
  return useQuery({
    queryKey: leaveKeys.calendar(year, month),
    queryFn: ({ signal }) => api.get<TeamLeaveCalendar>('/leave/calendar/', { params: { year, month }, signal }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export interface PreviewInput {
  /** Omitted for interns (always "Leave"). */
  leave_type?: number
  from_date: string
  to_date: string
  is_half_day: boolean
  half: string
}

export function useLeavePreview(input: PreviewInput | null) {
  return useQuery({
    queryKey: ['leave', 'preview', input],
    queryFn: ({ signal }) => api.post<LeavePreview>('/leave/preview/', input, { signal }).then((r) => r.data),
    enabled: !!input,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  })
}

function useInvalidateLeave() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: leaveKeys.all })
    qc.invalidateQueries({ queryKey: ['attendance'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export interface ApplyInput extends PreviewInput {
  reason: string
  cc_ids: number[]
}

export function useApplyLeave() {
  const invalidate = useInvalidateLeave()
  return useMutation({
    mutationFn: (data: ApplyInput) => api.post<LeaveRequest>('/leave/requests/', data).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useLeaveAction() {
  const qc = useQueryClient()
  const invalidate = useInvalidateLeave()
  return useMutation({
    mutationFn: ({ id, action, comment }: { id: number; action: 'approve' | 'reject' | 'cancel'; comment?: string }) =>
      api.post<LeaveRequest>(`/leave/requests/${id}/${action}/`, action === 'cancel' ? {} : { comment }).then((r) => r.data),
    onMutate: async ({ id, action }) => {
      await qc.cancelQueries({ queryKey: ['leave', 'requests'] })
      const snapshots = qc.getQueriesData<Paginated<LeaveRequest>>({ queryKey: ['leave', 'requests'] })
      const next: RequestStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'
      qc.setQueriesData<Paginated<LeaveRequest>>({ queryKey: ['leave', 'requests'] }, (old) =>
        old ? { ...old, results: old.results.map((r) => (r.id === id ? { ...r, status: next, can_decide: false, can_cancel: false } : r)) } : old,
      )
      return { snapshots }
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshots.forEach(([k, d]) => qc.setQueryData(k, d))
      toast.error(getErrorMessage(err))
    },
    onSuccess: (r, { action }) =>
      toast.success(
        action === 'cancel'
          ? 'Leave cancelled; balance restored'
          : `${r.leave_type.name} for ${r.user.name.split(' ')[0]} ${action === 'approve' ? 'approved' : 'rejected'}`,
      ),
    onSettled: invalidate,
  })
}

export function useAdjustBalance() {
  const invalidate = useInvalidateLeave()
  return useMutation({
    mutationFn: (data: { user: number; leave_type: number; year: number; delta: string; reason: string }) =>
      api.post<LeaveBalance>('/leave/balances/adjust/', data).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useSaveLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Partial<LeaveType> }) =>
      (id ? api.patch<LeaveType>(`/leave/types/${id}/`, data) : api.post<LeaveType>('/leave/types/', data)).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  })
}

export function useDeleteLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/leave/types/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  })
}
