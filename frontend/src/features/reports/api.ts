import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AttendanceStatus, UserMini } from '@/lib/types'

/** Report rows carry the person's employee ID too. */
type ReportUser = UserMini & { employee_code?: string }

export interface RangeFilters {
  from: string
  to: string
  user?: number
  office_location?: number
}

export interface SummaryRow {
  user: ReportUser
  office: string | null
  manager: string | null
  working_days: number
  present: number
  late: number
  half_day: number
  incomplete: number
  absent: number
  on_leave: number
  worked_minutes: number
  avg_minutes: number
  avg_check_in: string | null
  attendance_rate: number | null
}

export interface DailyRow {
  user: { id: number; name: string; employee_code?: string }
  date: string
  status: AttendanceStatus
  check_in: string | null
  check_out: string | null
  worked_minutes: number
  distance_m: number | null
  office: string | null
  source: string | null
  remarks: string
  work_summary: string
}

export interface LeaveReportData {
  year: number
  types: { id: number; name: string; color: string; is_paid: boolean }[]
  results: { user: ReportUser; balances: Record<string, { total: number; used: number; available: number }>; approved_requests: Record<string, number> }[]
  requests: {
    id: number
    user: { id: number; name: string; employee_code?: string }
    leave_type: string
    from_date: string
    to_date: string
    days: number
    is_half_day: boolean
    status: string
    reason: string
    decided_by: string | null
    applied_on: string
  }[]
}

const params = (f: RangeFilters) => ({ from: f.from, to: f.to, user: f.user, office_location: f.office_location })

export function useSummaryReport(f: RangeFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'summary', f],
    queryFn: ({ signal }) =>
      api.get<{ from: string; to: string; working_days: number; results: SummaryRow[] }>('/reports/attendance/summary/', { params: params(f), signal }).then((r) => r.data),
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useDailyReport(f: RangeFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'daily', f],
    queryFn: ({ signal }) =>
      api.get<{ from: string; to: string; results: DailyRow[] }>('/reports/attendance/daily/', { params: params(f), signal }).then((r) => r.data),
    enabled,
    placeholderData: (prev) => prev,
  })
}

export function useLeaveReport(year: number, user: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'leave', year, user],
    queryFn: ({ signal }) => api.get<LeaveReportData>('/reports/leave/', { params: { year, user }, signal }).then((r) => r.data),
    enabled,
    placeholderData: (prev) => prev,
  })
}
