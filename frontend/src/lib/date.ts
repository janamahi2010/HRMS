import { formatDistanceToNowStrict } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

/** All dates are displayed in India Standard Time regardless of the device timezone. */
export const TZ = 'Asia/Kolkata'

type DateInput = string | number | Date

const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d))

/** "10 Nov 2026" */
export const fmtDate = (d: DateInput) => formatInTimeZone(toDate(d), TZ, 'd MMM yyyy')
/** "Tue, 10 Nov" */
export const fmtDay = (d: DateInput) => formatInTimeZone(toDate(d), TZ, 'EEE, d MMM')
/** "09:41 AM" */
export const fmtTime = (d: DateInput) => formatInTimeZone(toDate(d), TZ, 'hh:mm a')
/** "10 Nov 2026, 09:41 AM" */
export const fmtDateTime = (d: DateInput) => formatInTimeZone(toDate(d), TZ, 'd MMM yyyy, hh:mm a')
/** "2h ago" */
export const fmtRelative = (d: DateInput) =>
  Math.abs(Date.now() - toDate(d).getTime()) < 45_000 ? 'just now' : formatDistanceToNowStrict(toDate(d), { addSuffix: true })

/** Date-only strings from the API ("2026-11-10") are calendar dates: never shift them by timezone. */
export const parseISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/** Today's date in IST as "yyyy-MM-dd". */
export const todayIST = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')

/** Current time as a Date whose local fields reflect IST (for greetings, clocks). */
export const nowIST = () => toZonedTime(new Date(), TZ)

export function greeting(): string {
  const h = nowIST().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** 135 -> "2h 15m" */
export function fmtMinutes(mins: number | null | undefined): string {
  if (mins == null) return '--'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
