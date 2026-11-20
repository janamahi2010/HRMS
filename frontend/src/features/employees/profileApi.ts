import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AttendanceRecord, IdName, Internship, RequestStatus, Role } from '@/lib/types'

export interface PersonMini {
  id: number
  name: string
  email: string
  designation: string
  is_active: boolean
}

export interface PersonOverview {
  profile: {
    id: number
    employee_code: string
    avatar_url?: string | null
    name: string
    email: string
    phone: string
    designation: string
    role: Role
    is_active: boolean
    joining_date: string | null
    /** "MM-DD" (never the year), or null if hidden / not set. */
    birthday: string | null
    internship: Internship | null
    manager: PersonMini | null
    office_location: IdName | null
    invite_pending: boolean
    password_change_pending: boolean
    remote_allowed?: boolean
    last_login: string | null
    created_at: string
  }
  chain: (PersonMini & { role: Role })[]
  direct_reports: { id: number; name: string; designation: string; is_active: boolean }[]
  month: {
    present: number
    late: number
    half_day: number
    absent: number
    on_leave: number
    incomplete: number
    avg_minutes: number
    attendance_rate: number | null
  }
  today: AttendanceRecord | null
  balances: { leave_type: { id: number; name: string; color: string; is_paid: boolean; for_interns?: boolean }; total: number; used: number; available: number }[]
  upcoming_leave: { id: number; type: string; color: string; from_date: string; to_date: string; days: number; status: RequestStatus }[]
  pending: { leave: number; regularization: number }
  /** Admins only: exact stored values for the edit form. */
  editable: { date_of_birth: string | null; internship_start: string | null; internship_end: string | null } | null
  is_self: boolean
  can_manage: boolean
}

export interface ActivityItem {
  id: number | string
  action: string
  label: string
  message: string
  actor: PersonMini | null
  created_at: string
}

export const personKeys = {
  all: ['person'] as const,
  overview: (id: number) => ['person', id, 'overview'] as const,
  activity: (id: number) => ['person', id, 'activity'] as const,
}

const fetchOverview = (id: number) => api.get<PersonOverview>(`/people/${id}/overview/`).then((r) => r.data)

export function usePersonOverview(id: number) {
  return useQuery({ queryKey: personKeys.overview(id), queryFn: () => fetchOverview(id), enabled: Number.isFinite(id) })
}

export function usePersonActivity(id: number, enabled: boolean) {
  return useQuery({
    queryKey: personKeys.activity(id),
    queryFn: () => api.get<ActivityItem[]>(`/people/${id}/activity/`).then((r) => r.data),
    enabled: enabled && Number.isFinite(id),
  })
}

/** Warm the profile on hover so it opens with data instead of a skeleton. */
export function prefetchPerson(qc: QueryClient, id: number) {
  return qc.prefetchQuery({ queryKey: personKeys.overview(id), queryFn: () => fetchOverview(id), staleTime: 30_000 })
}
