import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AttendanceStatus, Internship, Role, TodayState } from '@/lib/types'
import { attendanceKeys } from '@/features/attendance/api'

export interface DashboardData {
  role: Role
  today: TodayState
  me: {
    month: { present: number; late: number; half_day: number; absent: number; on_leave: number; incomplete: number; avg_minutes: number }
    balances: { leave_type: { id: number; name: string; color: string; is_paid: boolean; for_interns?: boolean }; total: number; used: number; available: number }[]
    pending: { leave: number; regularization: number }
    /** Past days checked in but never out, not fixed yet (newest first). */
    missed_checkouts: { date: string; check_in_at: string }[]
    upcoming_leave: { id: number; type: string; color: string; from_date: string; to_date: string; days: number; status: 'approved' | 'pending' }[]
  }
  holidays: { date: string; name: string }[]
  on_leave_today: {
    user: { id: number; name: string; designation: string }
    type: string
    color: string
    is_half_day: boolean
    half: 'first' | 'second' | null
    to_date: string
  }[]
  on_leave_count: number
  team?: {
    size: number
    today: Partial<Record<AttendanceStatus | 'none', number>>
    pending: { leave: number; regularization: number }
    approvals: {
      kind: 'leave' | 'regularization'
      id: number
      user: { id: number; name: string }
      title: string
      from_date: string
      to_date: string
      created_at: string
    }[]
    /** Interns (in my scope) ending within 30 days, or already ended. */
    internships: ({ user: { id: number; name: string; designation: string } } & Internship)[]
    /** Last 7 days (not today): who forgot to check out, how often, and how many aren't fixed yet. */
    forgot_checkout: { user: { id: number; name: string; designation: string }; count: number; unfixed: number; last_date: string }[]
  }
  company?: {
    active: number
    managers: number
    joiners: number
    no_office: number
    trend: { date: string; present: number; late: number; half_day: number; absent: number; on_leave: number; rate: number }[]
  }
}

export const dashboardKey = ['dashboard'] as const

export function useDashboard() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: dashboardKey,
    queryFn: async ({ signal }) => {
      const data = await api.get<DashboardData>('/dashboard/', { signal }).then((r) => r.data)
      // The check-in card reads its own query: seed it so the dashboard costs one request.
      qc.setQueryData(attendanceKeys.today, data.today)
      return data
    },
    refetchOnWindowFocus: true,
  })
}

export const prefetchDashboard = (qc: ReturnType<typeof useQueryClient>) =>
  qc.prefetchQuery({ queryKey: dashboardKey, queryFn: () => api.get<DashboardData>('/dashboard/').then((r) => r.data), staleTime: 30_000 })
