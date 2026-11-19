import { CheckCheck, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useClearRead, useNotifications, useNotificationSummary, useReadAll, type NotificationFilter } from './api'
import { FilterTabs, NotificationItems } from './NotificationList'

export default function NotificationsPage() {
  const [params, setParams] = useSearchParams()
  const filter: NotificationFilter = params.get('filter') === 'unread' ? 'unread' : 'all'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const list = useNotifications(filter, page)
  const summary = useNotificationSummary()
  const readAll = useReadAll()
  const clearRead = useClearRead()
  const unread = summary.data?.unread ?? 0

  const set = (f: NotificationFilter, p = 1) => {
    const next = new URLSearchParams()
    if (f === 'unread') next.set('filter', 'unread')
    if (p > 1) next.set('page', String(p))
    setParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Leave and request updates, company news and birthdays."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={unread === 0 || readAll.isPending} onClick={() => readAll.mutate(undefined, { onSuccess: () => toast.success('All marked as read') })}>
              <CheckCheck /> Mark all as read
            </Button>
            <Button variant="ghost" disabled={clearRead.isPending} onClick={() => clearRead.mutate(undefined, { onSuccess: () => toast.success('Read notifications cleared') })}>
              <Trash2 /> Clear read
            </Button>
          </div>
        }
      />
      <div className="mb-4">
        <FilterTabs value={filter} onChange={(f) => set(f)} unread={unread} />
      </div>
      <Card className="overflow-hidden p-0">
        <NotificationItems items={list.data?.results} loading={list.isLoading} error={list.error} onRetry={() => list.refetch()} filter={filter} skeletons={6} />
      </Card>
      {list.data && list.data.total_pages > 1 && (
        <Pagination
          className="mt-4"
          page={list.data.page}
          totalPages={list.data.total_pages}
          count={list.data.count}
          pageSize={list.data.page_size}
          onPageChange={(p) => set(filter, p)}
          fetching={list.isFetching}
        />
      )}
    </div>
  )
}
