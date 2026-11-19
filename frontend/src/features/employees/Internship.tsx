import { GraduationCap } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDate } from '@/lib/date'
import type { Internship } from '@/lib/types'
import { cn } from '@/lib/utils'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Short human label: "23 days left", "Last day today", "Ended 3 days ago", "Starts in 5 days", "No end date". */
export function internshipLabel(i: Internship): string {
  if (i.status === 'upcoming' && i.start) {
    const d = Math.round((Date.parse(i.start) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000)
    return d > 0 ? `Starts in ${plural(d, 'day')}` : 'Starts today'
  }
  if (i.days_left == null) return 'No end date'
  if (i.days_left < 0) return `Ended ${plural(-i.days_left, 'day')} ago`
  if (i.days_left === 0) return 'Last day today'
  return `${plural(i.days_left, 'day')} left`
}

const TONE: Record<Internship['status'], NonNullable<BadgeProps['tone']>> = {
  upcoming: 'neutral',
  ongoing: 'info',
  active: 'info',
  ending_soon: 'warning',
  ended: 'danger',
}

export function InternshipBadge({ internship, className }: { internship: Internship; className?: string }) {
  return (
    <Badge tone={TONE[internship.status]} dot className={className}>
      {internshipLabel(internship)}
    </Badge>
  )
}

/** Period + progress bar. Used on profiles, My profile and the intern's Home. */
export function InternshipCard({ internship, className, title = 'Internship' }: { internship: Internship; className?: string; title?: string }) {
  const i = internship
  const ended = i.status === 'ended'
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <GraduationCap className="size-4 text-muted-foreground" aria-hidden /> {title}
        </CardTitle>
        <InternshipBadge internship={i} />
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {i.days_left != null && i.days_left >= 0 && i.status !== 'upcoming' && (
          <p className="flex items-baseline gap-1.5">
            <span className="tabular text-3xl font-semibold tracking-tight">{i.days_left}</span>
            <span className="text-sm text-muted-foreground">{i.days_left === 1 ? 'day left' : 'days left'}</span>
          </p>
        )}
        {i.progress != null && (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={i.progress}
            aria-label="Internship completed"
          >
            <div
              className={cn('h-full rounded-full transition-[width]', ended ? 'bg-muted-foreground' : i.status === 'ending_soon' ? 'bg-warning' : 'bg-primary')}
              style={{ width: `${i.progress}%` }}
            />
          </div>
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="font-medium">{i.start ? fmtDate(i.start) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{ended ? 'Ended' : 'Ends'}</dt>
            <dd className="font-medium">{i.end ? fmtDate(i.end) : 'Not set'}</dd>
          </div>
        </dl>
        {i.total_days != null && (
          <p className="text-xs text-muted-foreground">
            {plural(i.total_days, 'day')} in total{i.progress != null && !ended && i.status !== 'upcoming' ? ` · ${i.progress}% done` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
