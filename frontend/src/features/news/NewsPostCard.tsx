import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ChevronLeft,
  Download,
  FileText,
  ChevronRight,
  Handshake,
  Megaphone,
  MoreHorizontal,
  Newspaper,
  PartyPopper,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fmtDate, fmtRelative } from '@/lib/date'
import { cn } from '@/lib/utils'
import { fmtSize } from '@/lib/upload'
import type { NewsAttachment, NewsCategory, NewsImage, NewsPost } from './api'

export const CATEGORY_META: Record<NewsCategory, { icon: LucideIcon; tone: NonNullable<BadgeProps['tone']> }> = {
  news: { icon: Newspaper, tone: 'primary' },
  announcement: { icon: Megaphone, tone: 'warning' },
  event: { icon: PartyPopper, tone: 'success' },
  mou: { icon: Handshake, tone: 'info' },
  achievement: { icon: Trophy, tone: 'orange' },
}

const NEW_FOR_MS = 3 * 24 * 60 * 60 * 1000
export const isNew = (p: NewsPost) => Date.now() - new Date(p.created_at).getTime() < NEW_FOR_MS

export function CategoryBadge({ post }: { post: NewsPost }) {
  const m = CATEGORY_META[post.category] ?? CATEGORY_META.news
  const Icon = m.icon
  return (
    <Badge tone={m.tone}>
      <Icon className="size-3" aria-hidden />
      {post.category_label}
    </Badge>
  )
}

/** Plain text with clickable links (React escapes everything else). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2 hover:decoration-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

export function PostBody({ text, clamp }: { text: string; clamp?: boolean }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 320 || text.split('\n').length > 5
  if (!text) return null
  return (
    <div>
      <p className={cn('whitespace-pre-line break-words text-[15px] leading-relaxed text-foreground/90', clamp && long && !open && 'line-clamp-4')}>
        <Linkified text={text} />
      </p>
      {clamp && long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-sm font-medium text-primary hover:underline">
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- documents

export function Attachments({ files, className }: { files?: NewsAttachment[]; className?: string }) {
  if (!files?.length) return null
  return (
    <ul className={cn('space-y-2', className)} aria-label="Attached documents">
      {files.map((f) => {
        const pdf = /\.pdf$/i.test(f.name)
        return (
          <li key={f.id}>
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
                  pdf ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-info-soft text-info-soft-foreground',
                )}
                aria-hidden
              >
                {pdf ? 'PDF' : <FileText className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium group-hover:text-primary">{f.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {pdf ? 'PDF' : 'Word document'} · {fmtSize(f.size)}
                </span>
              </span>
              <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- photos

export function PhotoGrid({ images, title, className }: { images: NewsImage[]; title: string; className?: string }) {
  const [viewing, setViewing] = useState<number | null>(null)
  if (images.length === 0) return null
  const shown = images.slice(0, 4)
  const extra = images.length - shown.length
  const tile = (img: NewsImage, i: number, cls: string, style?: React.CSSProperties) => (
    <button
      key={img.id}
      type="button"
      onClick={() => setViewing(i)}
      className={cn('group relative overflow-hidden bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', cls)}
      style={style}
      aria-label={`Open photo ${i + 1} of ${images.length}`}
    >
      <img
        src={img.url}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      {i === 3 && extra > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">+{extra}</span>
      )}
    </button>
  )

  let grid: ReactNode
  if (images.length === 1) {
    const img = images[0]!
    const ratio = img.width && img.height ? Math.min(2, Math.max(0.8, img.width / img.height)) : 16 / 9
    grid = tile(img, 0, 'block w-full max-h-[32rem] rounded-xl', { aspectRatio: String(ratio) })
  } else if (images.length === 2) {
    grid = <div className="grid grid-cols-2 gap-1.5">{shown.map((img, i) => tile(img, i, 'aspect-square rounded-lg'))}</div>
  } else if (images.length === 3) {
    grid = (
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1.5 sm:aspect-[16/10]">
        {tile(shown[0]!, 0, 'row-span-2 rounded-lg')}
        {tile(shown[1]!, 1, 'rounded-lg')}
        {tile(shown[2]!, 2, 'rounded-lg')}
      </div>
    )
  } else {
    grid = <div className="grid grid-cols-2 gap-1.5">{shown.map((img, i) => tile(img, i, 'aspect-[4/3] rounded-lg'))}</div>
  }

  return (
    <div className={className}>
      {grid}
      <Lightbox images={images} index={viewing} onIndex={setViewing} title={title} />
    </div>
  )
}

function Lightbox({ images, index, onIndex, title }: { images: NewsImage[]; index: number | null; onIndex: (i: number | null) => void; title: string }) {
  const touchX = useRef<number | null>(null)
  const n = images.length
  const go = (d: number) => index !== null && onIndex((index + d + n) % n)

  useEffect(() => {
    if (index === null || n < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onIndex((index + 1) % n)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, n, onIndex])

  const img = index !== null ? images[index] : null
  return (
    <DialogPrimitive.Root open={index !== null} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-16 focus:outline-none sm:px-20 sm:py-14"
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return
            const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
            touchX.current = null
          }}
          onClick={(e) => e.target === e.currentTarget && onIndex(null)}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Photo {(index ?? 0) + 1} of {n}
          </DialogPrimitive.Description>
          {img && <img key={img.id} src={img.url} alt={`${title}: photo ${(index ?? 0) + 1}`} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-pop-in" />}
          <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <X className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
          {n > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
                aria-label="Next photo"
              >
                <ChevronRight className="size-6" />
              </button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm tabular text-white" aria-hidden>
                {(index ?? 0) + 1} / {n}
              </p>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ---------------------------------------------------------------- post

interface PostActions {
  onEdit: (p: NewsPost) => void
  onTogglePin: (p: NewsPost) => void
  onDelete: (p: NewsPost) => void
}

export function PostMeta({ post }: { post: NewsPost }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={post.author?.name ?? 'Admin'} seed={post.author?.id ?? 0} src={post.author?.avatar_url} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{post.author?.name ?? 'Admin'}</p>
        <p className="truncate text-xs text-muted-foreground">
          <time dateTime={post.created_at} title={fmtDate(post.created_at)}>
            {fmtRelative(post.created_at)}
          </time>
          {post.author?.designation ? ` · ${post.author.designation}` : ''}
        </p>
      </div>
    </div>
  )
}

export function NewsPostCard({ post, actions, clamp = true }: { post: NewsPost; actions?: PostActions; clamp?: boolean }) {
  return (
    <Card className="overflow-hidden scroll-mt-20" id={`post-${post.id}`}>
      <article aria-labelledby={`post-title-${post.id}`} className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <PostMeta post={post} />
          {actions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${post.title}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onEdit(post)}>
                  <Pencil /> Edit post
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onTogglePin(post)}>
                  {post.is_pinned ? (
                    <>
                      <PinOff /> Unpin
                    </>
                  ) : (
                    <>
                      <Pin /> Pin to top
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.onDelete(post)} className="text-destructive focus:text-destructive">
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <CategoryBadge post={post} />
          {post.is_pinned && (
            <Badge tone="outline">
              <Pin className="size-3" aria-hidden /> Pinned
            </Badge>
          )}
          {isNew(post) && <Badge tone="success">New</Badge>}
          {post.event_date && <span className="text-xs text-muted-foreground">· {fmtDate(post.event_date)}</span>}
        </div>

        <h2 id={`post-title-${post.id}`} className="mt-2 text-lg font-semibold leading-snug tracking-tight text-balance">
          {post.title}
        </h2>
        <div className="mt-1.5">
          <PostBody text={post.body} clamp={clamp} />
        </div>
        <PhotoGrid images={post.images} title={post.title} className="mt-3" />
        <Attachments files={post.attachments} className="mt-3" />
      </article>
    </Card>
  )
}
