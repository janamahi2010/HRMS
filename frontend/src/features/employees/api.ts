import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import type { Employee, EmployeeInput, Paginated, Role } from '@/lib/types'

export interface EmployeeFilters {
  search: string
  role: Role | 'all'
  status: 'active' | 'inactive' | 'all'
  page: number
}

export const employeeKeys = {
  all: ['employees'] as const,
  list: (f: EmployeeFilters) => ['employees', 'list', f] as const,
}

export function useEmployees(f: EmployeeFilters) {
  return useQuery({
    queryKey: employeeKeys.list(f),
    queryFn: ({ signal }) =>
      api
        .get<Paginated<Employee>>('/employees/', {
          params: {
            search: f.search || undefined,
            role: f.role === 'all' ? undefined : f.role,
            status: f.status === 'all' ? undefined : f.status,
            page: f.page,
          },
          signal,
        })
        .then((r) => r.data),
    placeholderData: (prev) => prev, // keep previous page visible while the next loads
  })
}

function useInvalidateEmployees() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: employeeKeys.all })
    qc.invalidateQueries({ queryKey: ['user-lookup'] })
    qc.invalidateQueries({ queryKey: ['locations'] }) // employee counts
    qc.invalidateQueries({ queryKey: ['person'] }) // open profile pages
  }
}

export function useSaveEmployee() {
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: EmployeeInput }) =>
      (id ? api.patch<Employee>(`/employees/${id}/`, data) : api.post<Employee>('/employees/', data)).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useSetEmployeeActive() {
  const qc = useQueryClient()
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.post<Employee>(`/employees/${id}/${active ? 'activate' : 'deactivate'}/`).then((r) => r.data),
    // Optimistic: flip the badge immediately, roll back on error.
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: employeeKeys.all })
      await qc.cancelQueries({ queryKey: ['person', id] })
      const snapshots: [readonly unknown[], unknown][] = [
        ...qc.getQueriesData<Paginated<Employee>>({ queryKey: employeeKeys.all }),
        [['person', id, 'overview'], qc.getQueryData(['person', id, 'overview'])],
      ]
      qc.setQueriesData<Paginated<Employee>>({ queryKey: employeeKeys.all }, (old) =>
        old ? { ...old, results: old.results.map((e) => (e.id === id ? { ...e, is_active: active } : e)) } : old,
      )
      // The open profile page flips at the same moment as the list.
      qc.setQueryData<{ profile: { is_active: boolean } }>(['person', id, 'overview'], (old) =>
        old ? { ...old, profile: { ...old.profile, is_active: active } } : old,
      )
      return { snapshots }
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(getErrorMessage(err))
    },
    onSuccess: (emp) => toast.success(`${emp.name} ${emp.is_active ? 'activated' : 'deactivated'}`),
    onSettled: invalidate,
  })
}

export function useResendInvite() {
  return useMutation({
    mutationFn: (id: number) => api.post<{ detail: string }>(`/employees/${id}/resend-invite/`).then((r) => r.data),
    onSuccess: (d) => toast.success(d.detail),
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSetEmployeePassword() {
  const invalidate = useInvalidateEmployees()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; password?: string; must_change_password?: boolean; use_email?: boolean }) =>
      api.post<Employee>(`/employees/${id}/set-password/`, body).then((r) => r.data),
    onSuccess: invalidate,
  })
}
