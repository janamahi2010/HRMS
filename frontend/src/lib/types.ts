/** Shared API types. Mirrors the DRF serializers. */

export type Role = 'admin' | 'manager' | 'employee' | 'intern'

/** Interns only: period and progress (all dates are IST calendar dates). */
export interface Internship {
  start: string | null
  end: string | null
  /** 0 = last day today, negative = ended that many days ago, null = no end date. */
  days_left: number | null
  total_days: number | null
  progress: number | null
  status: 'upcoming' | 'ongoing' | 'active' | 'ending_soon' | 'ended'
}

export interface CompanyMini {
  id: number
  name: string
  logo_url: string | null
  /** Admin-uploaded birthday artwork (only on /company/). */
  birthday_poster_url?: string | null
}

export interface UserMini {
  id: number
  name: string
  email: string
  designation: string
  /** Profile photo (null = show initials). */
  avatar_url?: string | null
}

export interface IdName {
  id: number
  name: string
}

export interface Me {
  id: number
  employee_code: string
  email: string
  name: string
  phone: string
  designation: string
  role: Role
  joining_date: string | null
  date_of_birth: string | null
  show_birthday: boolean
  remote_allowed?: boolean
  avatar_url?: string | null
  internship: Internship | null
  /** An admin set the password: they must choose their own before using the app. */
  must_change_password: boolean
  company: CompanyMini
  manager: UserMini | null
  office_location: IdName | null
}

/** Result of /users/lookup/: used by pickers. */
export interface UserLite {
  id: number
  name: string
  email: string
  designation: string
  role: Role
  avatar_url?: string | null
}

export interface Employee {
  id: number
  /** e.g. EMP001 / INT001. */
  employee_code: string
  name: string
  email: string
  phone: string
  designation: string
  role: Role
  is_active: boolean
  joining_date: string | null
  manager: UserMini | null
  office_location: IdName | null
  date_of_birth?: string | null
  internship_start?: string | null
  internship_end?: string | null
  internship?: Internship | null
  /** Still using an admin-set (e.g. email) password they haven't changed yet. */
  password_change_pending?: boolean
  /** Can check in from anywhere. */
  remote_allowed?: boolean
  avatar_url?: string | null
  invite_pending: boolean
  direct_reports: number
  last_login: string | null
  created_at: string
}

export interface EmployeeInput {
  /** Blank = assign the next number automatically. */
  employee_code?: string
  name: string
  email: string
  phone: string
  designation: string
  role: Role
  manager_id: number | null
  office_location_id: number | null
  joining_date: string | null
  date_of_birth?: string | null
  internship_start?: string | null
  internship_end?: string | null
  remote_allowed?: boolean
  send_invite?: boolean
  /** Create only: admin-chosen password (then no invite email is sent). */
  password?: string
  must_change_password?: boolean
  /** Create only: first password = their email address (must be changed at first sign-in). */
  use_email_as_password?: boolean
}

export interface OfficeLocation {
  id: number
  name: string
  address: string
  latitude: string
  longitude: string
  radius_m: number
  is_active: boolean
  employee_count: number
}

export interface Holiday {
  id: number
  date: string
  name: string
}

export interface CompanySettings {
  office_start: string
  office_end: string
  late_after: string
  half_day_hours: string
  weekly_offs: number[]
  work_summary_required: boolean
  /** Days before this are never Absent (YYYY-MM-DD, null = count from joining date). */
  attendance_start: string | null
  default_cc: number[]
  default_cc_users: UserMini[]
  /** Stands in when someone's reporting manager is on leave. */
  backup_approver: number | null
  backup_approver_user: UserMini | null
}

export interface AuthResponse {
  access: string
  refresh: string
  user: Me
}

export interface Paginated<T> {
  count: number
  page: number
  page_size: number
  total_pages: number
  results: T[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string[] | Record<string, string[]>>
    [extra: string]: unknown
  }
}

// ---------------------------------------------------------------- Attendance

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half_day'
  | 'absent'
  | 'on_leave'
  | 'holiday'
  | 'weekly_off'
  | 'incomplete'
  | 'not_checked_in'

export type DayKind = 'working' | 'holiday' | 'weekly_off'

export interface AttendanceRecord {
  id: number
  date: string
  status: AttendanceStatus
  source: 'gps' | 'remote' | 'regularization' | 'system'
  check_in_at: string | null
  check_out_at: string | null
  check_in_distance_m: number | null
  check_out_distance_m: number | null
  check_in_accuracy_m: number | null
  worked_minutes: number
  is_late: boolean
  office: string | null
  remarks: string
  /** What the employee worked on that day (daily work log). */
  work_summary: string
  work_summary_updated_at: string | null
  /** Today, or yesterday until 12:00 IST. Only meaningful for your own records. */
  summary_editable: boolean
  /** ISO time when the note locks (noon next day, or 48 h after a regularization approval). */
  summary_editable_until: string
}

export interface LeaveMini {
  id: number
  type: string
  color: string
  is_half_day: boolean
  half: 'first' | 'second' | null
}

export interface TodayState {
  date: string
  server_time: string
  day_kind: DayKind
  holiday_name: string | null
  leave: LeaveMini | null
  office: { id: number; name: string; address: string; latitude: number; longitude: number; radius_m: number; is_active: boolean } | null
  timings: { office_start: string; office_end: string; late_after: string; half_day_hours: number }
  record: AttendanceRecord | null
  can_check_in: boolean
  can_check_out: boolean
  blocked: { code: string; message: string } | null
  max_accuracy_m: number
  /** Allowed to check in / out from anywhere (work from home, field work). */
  remote_allowed?: boolean
  work_summary_required: boolean
  work_summary_min_chars: number
}

export interface CalendarDay {
  date: string
  day_kind: DayKind
  status: AttendanceStatus | null
  holiday_name: string | null
  leave: LeaveMini | null
  record: AttendanceRecord | null
}

export interface MonthCalendar {
  year: number
  month: number
  user: { id: number; name: string; joining_date: string | null }
  days: CalendarDay[]
  summary: Record<'present' | 'late' | 'half_day' | 'absent' | 'on_leave' | 'incomplete' | 'holiday' | 'weekly_off', number> & {
    working_days: number
    worked_minutes: number
    avg_minutes: number
  }
}

export interface TeamDayRow {
  user: { id: number; name: string; email: string; designation: string; office: string | null }
  status: AttendanceStatus | null
  leave: LeaveMini | null
  record: AttendanceRecord | null
}

export interface TeamDay {
  date: string
  total: number
  summary: Record<string, number>
  results: TeamDayRow[]
}

// ---------------------------------------------------------------- Requests

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type RegularizationType = 'missed_punch' | 'wfh' | 'client_visit'

export interface Regularization {
  id: number
  user: UserMini
  date: string
  type: RegularizationType
  type_label: string
  check_in_time: string
  check_out_time: string
  reason: string
  status: RequestStatus
  approver: UserMini | null
  decided_by: UserMini | null
  decision_comment: string
  decided_at: string | null
  attendance_status: AttendanceStatus | null
  can_decide: boolean
  can_cancel: boolean
  created_at: string
}

export interface RegularizationInput {
  date: string
  type: RegularizationType
  check_in_time: string
  check_out_time: string
  reason: string
}

// ---------------------------------------------------------------- Leave

export interface LeaveTypeMini {
  id: number
  name: string
  color: string
  is_paid: boolean
  allow_half_day: boolean
  /** The interns' plain "Leave" type: counted when approved. */
  for_interns?: boolean
  /** Yearly: all on 1 Jan. Monthly: 1/12 credited on the 1st of each month. */
  accrual?: 'yearly' | 'monthly'
  yearly_quota?: string
}

export interface LeaveType extends LeaveTypeMini {
  yearly_quota: string
  is_active: boolean
  accrual: 'yearly' | 'monthly'
}

export interface LeaveBalance {
  id: number
  leave_type: LeaveTypeMini
  year: number
  total: string
  used: string
  available: string
}

export interface LeaveRequest {
  id: number
  user: UserMini
  leave_type: LeaveTypeMini
  from_date: string
  to_date: string
  is_half_day: boolean
  half: '' | 'first' | 'second'
  days: string
  reason: string
  status: RequestStatus
  approver: UserMini | null
  decided_by: UserMini | null
  decision_comment: string
  decided_at: string | null
  cc_users: UserMini[]
  can_decide: boolean
  can_cancel: boolean
  is_cc: boolean
  created_at: string
}

export interface LeaveIssue {
  code: string
  message: string
  field?: string
}

export interface LeavePreview {
  days: number
  breakdown: { date: string; kind: DayKind; name: string | null }[]
  balance: { year: number; total: number; used: number; available: number; after: number; is_paid: boolean } | null
  issues: LeaveIssue[]
}

export interface OnLeaveEntry {
  user: UserMini
  leave_type: { name: string; color: string }
  from_date: string
  to_date: string
  is_half_day: boolean
  half: 'first' | 'second' | null
}

export interface TeamLeaveCalendar {
  year: number
  month: number
  weekly_offs: number[]
  holidays: { date: string; name: string }[]
  members: UserMini[]
  leaves: {
    id: number
    user_id: number
    from_date: string
    to_date: string
    status: 'approved' | 'pending'
    is_half_day: boolean
    half: 'first' | 'second' | null
    days: number
    leave_type: { name: string; color: string }
  }[]
}

export interface BalanceOverview extends Paginated<{ user: UserMini; balances: Record<string, { total: number; used: number; available: number }> }> {
  types: LeaveType[]
  year: number
}
