import { AlarmClock, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtTime, parseISODate } from '@/lib/date'
import type { DashboardData } from './api'

const day = (iso: string) => format(parseISODate(iso), 'EEE, d MMM')
const fixLink = (iso: string) => `/requests?new=1&date=${iso}`

/** "You forgot to check out on …" with a one-tap fix (opens a pre-filled missed-punch request). */
export function MissedCheckoutBanner({ days }: { days: DashboardData['me']['missed_checkouts'] }) {
  const navigate = useNavigate()
  const [first, ...rest] = days
  if (!first) return null
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-warning-soft-foreground sm:flex-row sm:items-center">
      <AlarmClock className="hidden size-5 shrink-0 sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">You forgot to check out on {day(first.date)}</p>
        <p className="text-[13px] opacity-90">
          You checked in at {fmtTime(first.check_in_at)}. Send a missed-punch request so the day isn't counted as incomplete.
          {rest.length > 0 && (
            <>
              {' '}Also:{' '}
              {rest.map((r, i) => (
                <span key={r.date}>
                  {i > 0 && ', '}
                  <Link to={fixLink(r.date)} className="font-medium underline underline-offset-2">
                    {day(r.date)}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>
      </div>
      <Button size="sm" className="shrink-0 self-start sm:self-center" onClick={() => navigate(fixLink(first.date))}>
        Fix it <ArrowRight />
      </Button>
    </div>
  )
}

/** Managers / admins: who forgot to check out in the last 7 days. */
export function ForgotCheckout({ items, canOpen }: { items: NonNullable<DashboardData['team']>['forgot_checkout']; canOpen: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-[15px]">Forgot to check out · last 7 days</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">Days they checked in but not out. They're reminded in the evening and the next morning.</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="-mx-2 divide-y divide-border">
          {items.slice(0, 6).map((r) => {
            const body = (
              <>
                <Avatar name={r.user.name} seed={r.user.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Last on {day(r.last_date)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular">
                    {r.count} {r.count === 1 ? 'day' : 'days'}
                  </span>
                  {r.unfixed > 0 ? <Badge tone="warning">{r.unfixed} not fixed</Badge> : <Badge tone="success">Request sent</Badge>}
                </div>
              </>
            )
            return (
              <li key={r.user.id}>
                {canOpen ? (
                  <Link
                    to={`/employees/${r.user.id}`}
                    state={{ from: '/' }}
                    className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-14 items-center gap-3 px-2 py-2.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
        {items.length > 6 && <p className="mt-2 text-xs text-muted-foreground">+{items.length - 6} more people</p>}
      </CardContent>
    </Card>
  )
}
