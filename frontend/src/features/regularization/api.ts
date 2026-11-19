import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import type { Paginated, Regularization, RegularizationInput, RequestStatus } from '@/lib/types'

export type RegScope = 'mine' | 'approvals' | 'team'

export interface RegFilters {
  scope: RegScope
  status: RequestStatus | 'all'
  search: string
  page: number
  /** Only this person's requests (employee profile page). */
  user?: number
}

export const regKeys = {
  all: ['regularizations'] as const,
  list: (f: RegFilters) => ['regularizations', f] as const,
}

export function useRegularizations(f: RegFilters) {
  return useQuery({
    queryKey: regKeys.list(f),
    queryFn: ({ signal }) =>
      api
        .get<Paginated<Regularization>>('/regularizations/', {
          params: {
            scope: f.scope,
            user: f.user,
            status: f.status === 'all' ? undefined : f.status,
            search: f.search || undefined,
            page: f.page,
          },
          signal,
        })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: regKeys.all })
    qc.invalidateQueries({ queryKey: ['attendance'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['pending-counts'] })
  }
}

export function useCreateRegularization() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (data: RegularizationInput) => api.post<Regularization>('/regularizations/', data).then((r) => r.data),
    onSuccess: invalidate,
  })
}

/** Approve / reject / cancel. Optimistically drops the item from the approvals queue. */
export function useRegularizationAction() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, action, comment }: { id: number; action: 'approve' | 'reject' | 'cancel'; comment?: string }) =>
      api.post<Regularization>(`/regularizations/${id}/${action}/`, action === 'cancel' ? {} : { comment }).then((r) => r.data),
    onMutate: async ({ id, action }) => {
      await qc.cancelQueries({ queryKey: regKeys.all })
      const snapshots = qc.getQueriesData<Paginated<Regularization>>({ queryKey: regKeys.all })
      const next: RequestStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'
      qc.setQueriesData<Paginated<Regularization>>({ queryKey: regKeys.all }, (old) => {
        if (!old) return old
        return {
          ...old,
          results: old.results.map((r) => (r.id === id ? { ...r, status: next, can_decide: false, can_cancel: false } : r)),
        }
      })
      return { snapshots }
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshots.forEach(([k, d]) => qc.setQueryData(k, d))
      toast.error(getErrorMessage(err))
    },
    onSuccess: (r, { action }) =>
      toast.success(
        action === 'cancel'
          ? 'Request cancelled'
          : `${r.type_label} for ${r.user.name.split(' ')[0]} ${action === 'approve' ? 'approved' : 'rejected'}`,
      ),
    onSettled: invalidate,
  })
}
