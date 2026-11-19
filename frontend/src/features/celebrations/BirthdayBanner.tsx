import { Check, Gift, PartyPopper } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUser } from '@/features/auth/AuthProvider'
import { fmtRelative } from '@/lib/date'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useCelebrations, useSendWish, type Celebrations } from './api'
import { BirthdayPoster } from './BirthdayPoster'

const first = (name: string) => name.split(' ')[0]

/**
 * Today's birthdays, shown at the top of everyone's Home page. Renders nothing on ordinary days.
 * `ready`: wait for the rest of the page so the card arrives with it instead of pushing content down later.
 */
export function BirthdayBanner({ ready = true }: { ready?: boolean }) {
  const q = useCelebrations()
  const me = useUser()
  if (!ready || !q.data || q.data.today.length === 0) return null
  const items = q.data.today
  return (
    <section aria-label="Birthdays today" className={cn('grid gap-4', items.length > 1 && 'lg:grid-cols-2')}>
      {items.map((t) =>
        t.is_me ? (
          <MyBirthday key={t.user.id} item={t} posterUrl={q.data.poster_url} company={me.company.name} />
        ) : (
          <ColleagueBirthday key={t.user.id} item={t} posterUrl={q.data.poster_url} company={me.company.name} />
        ),
      )}
    </section>
  )
}

type Item = Celebrations['today'][number]

function ColleagueBirthday({ item, posterUrl, company }: { item: Item; posterUrl: string | null; company: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <BirthdayPoster
        name={item.user.name}
        posterUrl={posterUrl}
        subtitle={`Wishing you a wonderful year ahead, from everyone at ${company}.`}
        className="h-40 sm:h-44"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {item.wishes_count === 0
            ? `Be the first to wish ${first(item.user.name)}!`
            : `${item.wishes_count} ${item.wishes_count === 1 ? 'colleague has' : 'colleagues have'} wished ${first(item.user.name)}`}
        </p>
        <WishButton item={item} />
      </div>
    </Card>
  )
}

function WishButton({ item }: { item: Item }) {
  const send = useSendWish()
  const [open, setOpen] = useState(false)
  const name = first(item.user.name)
  const [message, setMessage] = useState(`Happy birthday, ${name}! 🎉 Have a wonderful year.`)

  const submit = () =>
    send.mutate(
      { to_user: item.user.id, message: message.trim() },
      {
        onSuccess: () => toast.success(`Your wishes were sent to ${name} 🎉`),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={item.wished_by_me ? 'outline' : 'default'} size="sm">
          {item.wished_by_me ? <Check /> : <Gift />}
          {item.wished_by_me ? 'Wished' : 'Send wishes'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <label htmlFor={`wish-${item.user.id}`} className="block text-sm font-medium">
          {item.wished_by_me ? `Edit your note to ${name}` : `Wish ${name} a happy birthday`}
        </label>
        <Textarea
          id={`wish-${item.user.id}`}
          rows={3}
          maxLength={200}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              submit()
              setOpen(false)
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="tabular text-xs text-muted-foreground">{message.length}/200</span>
          <Button
            size="sm"
            loading={send.isPending}
            onClick={() => {
              submit()
              setOpen(false)
            }}
          >
            {!send.isPending && <PartyPopper />} {item.wished_by_me ? 'Update' : 'Send'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MyBirthday({ item, posterUrl, company }: { item: Item; posterUrl: string | null; company: string }) {
  const wishes = item.wishes ?? []
  // Confetti once per day per browser, so it stays special instead of replaying on every visit.
  const key = `hrms-bday-confetti:${item.user.id}:${new Date().toDateString()}`
  const [celebrate] = useState(() => {
    try {
      return !localStorage.getItem(key)
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
  }, [key])

  return (
    <Card className="overflow-hidden p-0">
      <BirthdayPoster
        name={item.user.name}
        posterUrl={posterUrl}
        subtitle={`Everyone at ${company} wishes you a fantastic year ahead!`}
        className="h-44 sm:h-48"
        celebrate={celebrate}
      />
      <div className="px-4 py-3">
        <p className="text-sm font-medium">
          {wishes.length === 0
            ? 'Your colleagues can see your birthday today. Wishes will appear here.'
            : `${wishes.length} ${wishes.length === 1 ? 'colleague' : 'colleagues'} wished you 💝`}
        </p>
        {wishes.length > 0 && (
          <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {wishes.map((w) => (
              <li key={w.id} className="flex gap-3">
                <Avatar name={w.from.name} seed={w.from.id} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{w.from.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">· {fmtRelative(w.created_at)}</span>
                  </p>
                  {w.message && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground">{w.message}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
