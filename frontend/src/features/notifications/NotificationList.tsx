import {
  AlarmClock,
  Ban,
  Bell,
  Cake,
  CheckCircle2,
  ClipboardList,
  Clock,
  Heart,
  Inbox,
  Mail,
  MailOpen,
  MoreHorizontal,
  Newspaper,
  PartyPopper,
  Trash2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDateTime, fmtRelative } from '@/lib/date'
import { cn } from '@/lib/utils'
import { useDeleteNotification, useMarkRead, useMarkUnread, type AppNotification, type NotificationFilter, type NotificationKind } from './api'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'orange' | 'neutral'
export const KIND_META: Record<NotificationKind, { icon: LucideIcon; tone: Tone }> = {
  leave_applied: { icon: Inbox, tone: 'warning' },
  leave_approved: { icon: CheckCircle2, tone: 'success' },
  leave_rejected: { icon: XCircle, tone: 'danger' },
  leave_cancelled: { icon: Ban, tone: 'neutral' },
  leave_cc: { icon: Mail, tone: 'info' },
  request_submitted: { icon: ClipboardList, tone: 'warning' },
  request_approved: { icon: CheckCircle2, tone: 'success' },
  request_rejected: { icon: XCircle, tone: 'danger' },
  news: { icon: Newspaper, tone: 'primary' },
  birthday: { icon: Cake, tone: 'orange' },
  birthday_self: { icon: PartyPopper, tone: 'orange' },
  birthday_wish: { icon: Heart, tone: 'danger' },
  checkout_reminder: { icon: Clock, tone: 'warning' },
  missed_checkout: { icon: AlarmClock, tone: 'danger' },
}
const TONE: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
  orange: 'bg-orange-soft text-orange-soft-foreground',
  neutral: 'bg-neutral-soft text-neutral-soft-foreground',
}

export function KindIcon({ kind, className }: { kind: NotificationKind; className?: string }) {
  const m = KIND_META[kind] ?? { icon: Bell, tone: 'neutral' as Tone }
  const Icon = m.icon
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', TONE[m.tone], className)} aria-hidden>
      <Icon className="size-[18px]" />
    </span>
  )
}

function Item({ n, onOpen }: { n: AppNotification; onOpen?: () => void }) {
  const navigate = useNavigate()
  const read = useMarkRead()
  const unread = useMarkUnread()
  const del = useDeleteNotification()
  const open = () => {
    if (!n.is_read) read.mutate(n.id)
    onOpen?.()
    if (n.link) navigate(n.link)
  }
  return (
    <li className={cn('group relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50', !n.is_read && 'bg-primary-soft/35')}>
      <KindIcon kind={n.kind} className="mt-0.5" />
      <button type="button" onClick={open} className="min-w-0 flex-1 text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
        <span className={cn('block text-sm leading-snug', n.is_read ? 'text-foreground/80' : 'font-semibold text-foreground')}>
          {n.title}
          {!n.is_read && <span className="sr-only"> (unread)</span>}
        </span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{n.body}</span>}
        <time dateTime={n.created_at} title={fmtDateTime(n.created_at)} className="mt-1 block text-xs text-muted-foreground">
          {fmtRelative(n.created_at)}
        </time>
      </button>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {!n.is_read && <span className="size-2 rounded-full bg-primary" aria-hidden />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Options for: ${n.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {n.is_read ? (
              <DropdownMenuItem onSelect={() => unread.mutate(n.id)}>
                <Mail /> Mark as unread
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => read.mutate(n.id)}>
                <MailOpen /> Mark as read
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => del.mutate(n.id)} className="text-destructive focus:text-destructive">
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

export function FilterTabs({ value, onChange, unread }: { value: NotificationFilter; onChange: (f: NotificationFilter) => void; unread: number }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Show">
      {(['all', 'unread'] as const).map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={cn(
            'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
            value === f ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {f === 'all' ? 'All' : `Unread${unread ? ` (${unread})` : ''}`}
        </button>
      ))}
    </div>
  )
}

export function NotificationItems({
  items,
  loading,
  error,
  onRetry,
  filter,
  onOpen,
  skeletons = 4,
}: {
  items?: AppNotification[]
  loading: boolean
  error?: unknown
  onRetry?: () => void
  filter: NotificationFilter
  onOpen?: () => void
  skeletons?: number
}) {
  if (error) return <ErrorState compact error={error} onRetry={onRetry} />
  if (loading)
    return (
      <ul aria-busy="true">
        {Array.from({ length: skeletons }, (_, i) => (
          <li key={i} className="flex gap-3 px-4 py-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    )
  if (!items?.length)
    return (
      <EmptyState
        compact
        icon={Bell}
        title={filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
        description={
          filter === 'unread'
            ? 'Nothing new right now.'
            : 'Leave and request updates, company news and birthdays will show up here.'
        }
      />
    )
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <Item key={n.id} n={n} onOpen={onOpen} />
      ))}
    </ul>
  )
}
