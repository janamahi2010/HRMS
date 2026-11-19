import { Cake } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { EmptyState } from '@/components/EmptyState'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { parseISODate } from '@/lib/date'
import { useCelebrations, type Celebrations } from './api'

const when = (days: number, iso: string) =>
  days === 1 ? 'Tomorrow' : days < 7 ? format(parseISODate(iso), 'EEEE') : format(parseISODate(iso), 'EEE, d MMM')

function BirthdayList({ items }: { items: Celebrations['upcoming'] }) {
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b.user.id} className="flex items-center gap-3">
          <Avatar name={b.user.name} seed={b.user.id} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{b.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{b.user.designation || '—'}</p>
          </div>
          <span className="shrink-0 text-right text-xs font-medium text-muted-foreground">
            {when(b.days_until, b.date)}
            {/* Within a week the first line is a weekday, so add the date; further out it already shows it. */}
            {b.days_until < 7 && <span className="block font-normal">{format(parseISODate(b.date), 'd MMM')}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "Upcoming birthdays" card for the Home page, with View all (next 60 days). */
export function UpcomingBirthdays() {
  const q = useCelebrations()
  const [open, setOpen] = useState(false)
  const all = useCelebrations(60, open) // only fetched when "View all" is opened
  const d = q.data
  const items = d?.upcoming.slice(0, 4) ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-[15px]">Upcoming birthdays</CardTitle>
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen(true)}>
          View all
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {!d ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState compact icon={Cake} title="No birthdays in the next 2 weeks" />
        ) : (
          <BirthdayList items={items} />
        )}
        {d && !d.my_birthday_set && (
          <p className="mt-4 border-t border-border pt-3 text-[13px] text-muted-foreground">
            🎂 <Link to="/profile" className="font-medium text-primary hover:underline">Add your birthday</Link> so your team can celebrate you.
          </p>
        )}
      </CardContent>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Upcoming birthdays" description="The next 60 days. Only the day and month are shown.">
        {all.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !all.data?.upcoming.length ? (
          <EmptyState compact icon={Cake} title="No birthdays in the next 60 days" />
        ) : (
          <BirthdayList items={all.data.upcoming} />
        )}
      </ResponsiveDialog>
    </Card>
  )
}
