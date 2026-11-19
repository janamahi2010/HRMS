import { Badge, type BadgeProps } from './ui/badge'

type Tone = NonNullable<BadgeProps['tone']>

/** Every status string the API can return, mapped to label + semantic tone. */
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Attendance
  present: { label: 'Present', tone: 'success' },
  late: { label: 'Late', tone: 'warning' },
  half_day: { label: 'Half-day', tone: 'orange' },
  absent: { label: 'Absent', tone: 'danger' },
  on_leave: { label: 'On leave', tone: 'info' },
  holiday: { label: 'Holiday', tone: 'neutral' },
  weekly_off: { label: 'Weekly off', tone: 'neutral' },
  incomplete: { label: 'Incomplete', tone: 'orange' },
  not_checked_in: { label: 'Not checked in', tone: 'outline' },
  // Requests
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  // Users
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  // Roles
  admin: { label: 'Admin', tone: 'primary' },
  manager: { label: 'Manager', tone: 'info' },
  employee: { label: 'Employee', tone: 'neutral' },
  intern: { label: 'Intern', tone: 'orange' },
}

export function statusMeta(status: string) {
  return STATUS_MAP[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' as Tone }
}

export function StatusBadge({ status, className, dot = true }: { status: string; className?: string; dot?: boolean }) {
  const { label, tone } = statusMeta(status)
  return (
    <Badge tone={tone} dot={dot} className={className}>
      {label}
    </Badge>
  )
}
