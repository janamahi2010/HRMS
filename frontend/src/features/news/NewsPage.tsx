import { Newspaper, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { NEWS_CATEGORIES, useMarkNewsSeen, useNews, useNewsUnread, type NewsCategory } from './api'
import { CATEGORY_META, NewsPostCard } from './NewsPostCard'
import { useNewsAdmin } from './useNewsAdmin'

const FILTERS: { value: NewsCategory | 'all'; label: string }[] = [{ value: 'all', label: 'All' }, ...NEWS_CATEGORIES]

export default function NewsPage() {
  const [params, setParams] = useSearchParams()
  const { hash } = useLocation()
  const raw = params.get('category')
  const category = (FILTERS.some((f) => f.value === raw) ? raw : 'all') as NewsCategory | 'all'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const q = useNews(category, page)
  const admin = useNewsAdmin()
  const unread = useNewsUnread()
  const markSeen = useMarkNewsSeen()
  const unreadCount = unread.data?.count ?? 0

  // Visiting the feed marks everything as seen (also when a new post arrives while you're here).
  useEffect(() => {
    if (unread.isSuccess && unreadCount > 0 && !markSeen.isPending) markSeen.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.isSuccess, unreadCount])

  const set = (next: { category?: string; page?: number }) => {
    const p = new URLSearchParams(params)
    if (next.category !== undefined) {
      if (next.category === 'all') p.delete('category')
      else p.set('category', next.category)
      p.delete('page')
    }
    if (next.page !== undefined) {
      if (next.page <= 1) p.delete('page')
      else p.set('page', String(next.page))
    }
    setParams(p, { replace: true })
  }

  // Opened from Home with #post-<id>: scroll to it once loaded.
  useEffect(() => {
    if (!hash || !q.data) return
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, q.data])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Company news"
        description="News, MoUs, events and programs from across the company."
        actions={
          admin.isAdmin && (
            <Button onClick={admin.openNew}>
              <Plus /> New post
            </Button>
          )
        }
      />

      <div className="-mx-4 mb-5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Filter by category">
        <div className="flex w-max gap-2">
          {FILTERS.map((f) => {
            const Icon = f.value === 'all' ? Newspaper : CATEGORY_META[f.value].icon
            const active = f.value === category
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => set({ category: f.value })}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
        </Card>
      ) : q.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="aspect-video w-full rounded-xl" />
            </Card>
          ))}
        </div>
      ) : q.data && q.data.results.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title={category === 'all' ? 'No news yet' : 'Nothing in this category yet'}
            description={
              admin.isAdmin
                ? 'Share company news, MoUs, events and programs. Everyone will see them on their Home page.'
                : 'Company news, MoUs, events and programs will show up here.'
            }
            action={
              admin.isAdmin && (
                <Button onClick={admin.openNew}>
                  <Plus /> New post
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className={cn('space-y-4 transition-opacity', q.isPlaceholderData && 'opacity-60')}>
          {q.data?.results.map((p) => <NewsPostCard key={p.id} post={p} actions={admin.actions} />)}
          {q.data && q.data.total_pages > 1 && (
            <Pagination
              page={q.data.page}
              totalPages={q.data.total_pages}
              count={q.data.count}
              pageSize={q.data.page_size}
              onPageChange={(n) => {
                set({ page: n })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              fetching={q.isFetching}
            />
          )}
        </div>
      )}
      {admin.dialogs}
    </div>
  )
}
