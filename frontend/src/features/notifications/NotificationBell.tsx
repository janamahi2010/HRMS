import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { useNotifications, useNotificationSummary, useReadAll, type NotificationFilter } from './api'
import { FilterTabs, NotificationItems } from './NotificationList'

function Panel({ onClose, mobile }: { onClose: () => void; mobile?: boolean }) {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const summary = useNotificationSummary()
  const list = useNotifications(filter, 1)
  const readAll = useReadAll()
  const unread = summary.data?.unread ?? 0
  const Title = mobile ? SheetTitle : 'h2'

  return (
    <div className="flex max-h-[inherit] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 pt-3 pb-2.5">
        <Title className="text-[15px] font-semibold">Notifications</Title>
        <Button variant="ghost" size="sm" className="text-primary" disabled={unread === 0 || readAll.isPending} onClick={() => readAll.mutate()}>
          <CheckCheck /> Mark all as read
        </Button>
      </div>
      {mobile && <SheetDescription className="sr-only">Your latest notifications</SheetDescription>}
      <div className="px-4 py-2.5">
        <FilterTabs value={filter} onChange={setFilter} unread={unread} />
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border', mobile ? 'max-h-[60dvh]' : 'max-h-[min(28rem,calc(100dvh-12rem))]')}>
        <NotificationItems items={list.data?.results} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} filter={filter} onOpen={onClose} />
      </div>
      <Link
        to="/notifications"
        onClick={onClose}
        className="block border-t border-border px-4 py-3 text-center text-[13px] font-medium text-primary hover:bg-muted/50"
      >
        View all notifications
      </Link>
    </div>
  )
}

/** Header bell: unread count + the latest notifications (popover on desktop, bottom sheet on phones). */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const summary = useNotificationSummary()
  const unread = summary.data?.unread ?? 0
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'

  const trigger = (
    <Button variant="ghost" size="icon" className="relative" aria-label={label} onClick={isMobile ? () => setOpen(true) : undefined}>
      <Bell className={cn('size-5', unread > 0 && 'origin-top animate-[bell-ring_0.9s_ease-in-out_1]')} />
      {unread > 0 && (
        <span
          className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none tabular text-white ring-2 ring-background"
          aria-hidden
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Button>
  )

  if (isMobile)
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="p-0">
            <Panel mobile onClose={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="Notifications" className="w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <Panel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
