import { Newspaper, Pin, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDate, fmtRelative } from '@/lib/date'
import { useNews, type NewsPost } from './api'
import { CATEGORY_META, CategoryBadge, isNew, PhotoGrid, PostBody, PostMeta } from './NewsPostCard'
import { useNewsAdmin } from './useNewsAdmin'

/** Home: the latest company news (pinned first). Hidden for non-admins when there's nothing posted. */
export function NewsHomeCard() {
  const q = useNews('all', 1, 3)
  const admin = useNewsAdmin()
  const [open, setOpen] = useState<NewsPost | null>(null)
  const posts = q.data?.results ?? []

  if (q.isError) return null
  if (!q.isLoading && posts.length === 0 && !admin.isAdmin) return null

  const lead = posts[0]
  const rest = posts.slice(1)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <Newspaper className="size-4 text-primary" aria-hidden /> Company news
        </CardTitle>
        <div className="flex items-center gap-1">
          {admin.isAdmin && posts.length > 0 && (
            <Button variant="ghost" size="sm" onClick={admin.openNew}>
              <Plus /> Post
            </Button>
          )}
          {posts.length > 0 && (
            <Link to="/news" className="px-2 text-[13px] font-medium text-primary hover:underline">
              View all
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="aspect-[16/7] w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ) : !lead ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Share company news, MoUs, events and programs with photos. Everyone will see them here on their Home page.
            </p>
            <Button onClick={admin.openNew}>
              <Plus /> Post the first update
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setOpen(lead)}
              className="group block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {lead.images[0] && (
                <div className="relative mb-3 aspect-[16/7] overflow-hidden rounded-xl bg-muted">
                  <img
                    src={lead.images[0].url}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    decoding="async"
                  />
                  {lead.images.length > 1 && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                      {lead.images.length} photos
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <CategoryBadge post={lead} />
                {lead.is_pinned && (
                  <Badge tone="outline">
                    <Pin className="size-3" aria-hidden /> Pinned
                  </Badge>
                )}
                {isNew(lead) && <Badge tone="success">New</Badge>}
                <span className="text-xs text-muted-foreground">{fmtRelative(lead.created_at)}</span>
              </div>
              <p className="mt-1.5 font-semibold leading-snug group-hover:text-primary">{lead.title}</p>
              {lead.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{lead.body}</p>}
            </button>

            {rest.length > 0 && (
              <ul className="-mx-2 mt-2 divide-y divide-border border-t border-border pt-1">
                {rest.map((p) => {
                  const Icon = CATEGORY_META[p.category]?.icon ?? Newspaper
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(p)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {p.images[0] ? (
                          <img src={p.images[0].url} alt="" loading="lazy" className="size-12 shrink-0 rounded-lg bg-muted object-cover" />
                        ) : (
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                            <Icon className="size-5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.category_label} · {fmtRelative(p.created_at)}
                          </span>
                        </span>
                        {isNew(p) && <Badge tone="success">New</Badge>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      <ResponsiveDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.title ?? ''} className="md:max-w-2xl">
        {open && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge post={open} />
              {open.event_date && <span className="text-xs text-muted-foreground">{fmtDate(open.event_date)}</span>}
            </div>
            <PostMeta post={open} />
            <PostBody text={open.body} />
            <PhotoGrid images={open.images} title={open.title} />
            <Link to={`/news#post-${open.id}`} className="inline-block text-sm font-medium text-primary hover:underline">
              Open in news feed
            </Link>
          </div>
        )}
      </ResponsiveDialog>
      {admin.dialogs}
    </Card>
  )
}
