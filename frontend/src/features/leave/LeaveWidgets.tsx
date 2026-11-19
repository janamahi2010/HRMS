import { Palmtree } from 'lucide-react'
import { format } from 'date-fns'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { parseISODate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useBalances, useOnLeave } from './api'

const num = (n: number | string) => {
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** Monthly share, e.g. 15/yr -> "1.25", 12/yr -> "1". */
const perMonth = (quota: number | string) => String(Math.round((Number(quota) / 12) * 100) / 100)

export function BalanceCards({ userId, className }: { userId?: number; className?: string }) {
  const q = useBalances(userId)
  if (q.isError) return <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {q.isLoading
        ? Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-3 h-1.5 w-full" />
            </Card>
          ))
        : q.data?.map((b) => {
            const total = Number(b.total)
            const used = Number(b.used)
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
            return (
              <Card key={b.id} className="p-4">
                <p className="flex items-center gap-2 truncate text-[13px] font-medium text-muted-foreground">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: b.leave_type.color }} aria-hidden />
                  {b.leave_type.for_interns ? 'Leaves taken' : b.leave_type.name}
                </p>
                {b.leave_type.is_paid ? (
                  <>
                    <p className="mt-1.5 flex items-baseline gap-1">
                      <span className="tabular text-2xl font-semibold tracking-tight">{num(b.available)}</span>
                      <span className="text-xs text-muted-foreground">of {num(b.total)} left</span>
                    </p>
                    <div
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={used}
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-label={`${b.leave_type.name}: ${num(used)} of ${num(total)} used`}
                    >
                      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: b.leave_type.color }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {num(used)} used or booked
                      {b.leave_type.accrual === 'monthly' && b.leave_type.yearly_quota && (
                        <span className="block">+{perMonth(b.leave_type.yearly_quota)} added every month</span>
                      )}
                    </p>
                  </>
                ) : b.leave_type.for_interns ? (
                  <>
                    <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{num(used)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{Number(used) === 1 ? 'day' : 'days'} taken · approved this year</p>
                  </>
                ) : (
                  <>
                    <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{num(used)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">days taken · no limit</p>
                  </>
                )}
              </Card>
            )
          })}
    </div>
  )
}

export function OnLeaveToday({ className }: { className?: string }) {
  const q = useOnLeave()
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px]">On leave today</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {q.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.results.length ? (
          <EmptyState compact icon={Palmtree} title="Everyone's in today" />
        ) : (
          <ul className="space-y-3">
            {q.data.results.map((e) => (
              <li key={`${e.user.id}-${e.from_date}`} className="flex items-center gap-3">
                <Avatar name={e.user.name} seed={e.user.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.is_half_day
                      ? `${e.half === 'first' ? 'First' : 'Second'} half`
                      : e.from_date === e.to_date
                        ? 'Today'
                        : `Until ${format(parseISODate(e.to_date), 'EEE, d MMM')}`}
                  </p>
                </div>
                <span className="flex max-w-28 shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: e.leave_type.color }} aria-hidden />
                  {e.leave_type.name.replace(/ Leave$/, '')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
