import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { todayIST } from '@/lib/date'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { MAX_PHOTOS, NEWS_CATEGORIES, shrinkPhoto, useSaveNews, type NewsCategory, type NewsPost } from './api'

const MAX_BODY = 5000
const MAX_FILE = 10 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

const schema = z.object({
  title: z.string().trim().min(3, 'Add a title (at least 3 characters)').max(150),
  category: z.enum(['news', 'announcement', 'event', 'mou', 'achievement']),
  event_date: z.string(),
  body: z.string().max(MAX_BODY, `Keep it under ${MAX_BODY} characters`),
  is_pinned: z.boolean(),
  email_everyone: z.boolean(),
})
type Values = z.infer<typeof schema>

interface NewPhoto {
  key: string
  file: File
  url: string
}

export function NewsFormDialog({ open, onOpenChange, post }: { open: boolean; onOpenChange: (o: boolean) => void; post?: NewsPost | null }) {
  const isEdit = !!post
  const save = useSaveNews()
  const fileRef = useRef<HTMLInputElement>(null)
  const [added, setAdded] = useState<NewPhoto[]>([])
  const [removed, setRemoved] = useState<number[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', category: 'news', event_date: '', body: '', is_pinned: false, email_everyone: true },
  })
  const { register, control, handleSubmit, formState, reset, setError, watch } = form
  const bodyLen = watch('body').length

  useEffect(() => {
    if (!open) return
    reset({
      title: post?.title ?? '',
      category: post?.category ?? 'news',
      event_date: post?.event_date ?? '',
      body: post?.body ?? '',
      is_pinned: post?.is_pinned ?? false,
      email_everyone: !post,
    })
    setAdded([])
    setRemoved([])
    setPhotoError(null)
  }, [open, post, reset])

  // Free preview URLs.
  useEffect(() => () => added.forEach((p) => URL.revokeObjectURL(p.url)), [added])

  const existing = useMemo(() => (post?.images ?? []).filter((i) => !removed.includes(i.id)), [post, removed])
  const total = existing.length + added.length

  const addFiles = (list: FileList | File[]) => {
    setPhotoError(null)
    const files = Array.from(list)
    const room = MAX_PHOTOS - total
    if (room <= 0) return setPhotoError(`A post can have at most ${MAX_PHOTOS} photos.`)
    const good: NewPhoto[] = []
    for (const f of files.slice(0, room)) {
      if (!TYPES.includes(f.type)) {
        setPhotoError(`${f.name}: use JPG, PNG or WebP photos.`)
        continue
      }
      if (f.size > MAX_FILE) {
        setPhotoError(`${f.name} is larger than 10 MB.`)
        continue
      }
      good.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, url: URL.createObjectURL(f) })
    }
    if (files.length > room) setPhotoError(`Only ${MAX_PHOTOS} photos per post: the extra ones were skipped.`)
    setAdded((a) => [...a, ...good])
  }

  const onSubmit = handleSubmit(async (v) => {
    if (!v.body.trim() && total === 0) {
      setError('body', { message: 'Add a description or at least one photo' })
      return
    }
    const files = await Promise.all(added.map((p) => shrinkPhoto(p.file)))
    save.mutate(
      {
        id: post?.id,
        data: {
          title: v.title.trim(),
          category: v.category as NewsCategory,
          event_date: v.event_date || null,
          body: v.body.trim(),
          is_pinned: v.is_pinned,
          email_everyone: !isEdit && v.email_everyone,
          new_images: files,
          remove_image_ids: removed,
        },
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Post updated' : 'Posted to the news feed', {
            description: isEdit ? undefined : v.email_everyone ? 'Everyone is notified in the app and by email.' : 'Everyone is notified in the app.',
          })
          onOpenChange(false)
        },
        onError: (err) => {
          const fields = (err as { response?: { data?: { error?: { fields?: Record<string, string[]> } } } }).response?.data?.error?.fields
          if (fields?.new_images) setPhotoError(String(fields.new_images[0]))
          if (!applyFieldErrors(err, setError) && !fields?.new_images) toast.error(getErrorMessage(err))
        },
      },
    )
  })

  const thumb = 'relative aspect-square overflow-hidden rounded-lg border border-border bg-muted'
  const removeBtn =
    'absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white'

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={isEdit ? 'Edit post' : 'New post'}
      description="Share company news, MoUs, events and programs with everyone."
      className="md:max-w-2xl"
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save changes' : 'Post'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label="Title" error={formState.errors.title?.message} className="sm:col-span-2">
          <Input placeholder="e.g. MoU signed with ABC University" maxLength={150} {...register('title')} />
        </FormField>
        <FormField label="Category" error={formState.errors.category?.message}>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEWS_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField label="Date of the event" hint="Optional. When it happened or takes place." error={formState.errors.event_date?.message}>
          <Input type="date" max={`${Number(todayIST().slice(0, 4)) + 2}-12-31`} {...register('event_date')} />
        </FormField>
        <FormField
          label="Description"
          className="sm:col-span-2"
          error={formState.errors.body?.message}
          aside={<span className={cn('text-xs tabular', bodyLen > MAX_BODY ? 'text-destructive' : 'text-muted-foreground')}>{bodyLen}/{MAX_BODY}</span>}
        >
          <Textarea rows={6} placeholder="What happened, who was involved, what it means for the team…" {...register('body')} />
        </FormField>

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">
            Photos <span className="font-normal text-muted-foreground">· {total}/{MAX_PHOTOS}</span>
          </legend>
          <div
            className={cn('grid grid-cols-3 gap-2 rounded-xl p-0.5 sm:grid-cols-6', dragging && 'outline-2 outline-dashed outline-primary')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            {existing.map((img, i) => (
              <div key={img.id} className={thumb}>
                <img src={img.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button type="button" className={removeBtn} onClick={() => setRemoved((r) => [...r, img.id])} aria-label={`Remove photo ${i + 1}`}>
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {added.map((p, i) => (
              <div key={p.key} className={thumb}>
                <img src={p.url} alt={`New photo ${i + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  className={removeBtn}
                  onClick={() => {
                    URL.revokeObjectURL(p.url)
                    setAdded((a) => a.filter((x) => x.key !== p.key))
                  }}
                  aria-label={`Remove new photo ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {total < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-xs font-medium">Add photos</span>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {photoError ? (
            <p role="alert" className="text-[13px] text-destructive">
              {photoError}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Up to {MAX_PHOTOS} photos · JPG, PNG or WebP · drag and drop works too.</p>
          )}
        </fieldset>

        <Controller
          control={control}
          name="is_pinned"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3 sm:col-span-2">
              <span>
                <span className="block text-sm font-medium">Pin to top</span>
                <span className="block text-[13px] text-muted-foreground">Keeps this post first on everyone's Home page.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Pin to top" />
            </label>
          )}
        />
        {!isEdit && (
          <Controller
            control={control}
            name="email_everyone"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3 sm:col-span-2">
                <span>
                  <span className="block text-sm font-medium">Also email everyone</span>
                  <span className="block text-[13px] text-muted-foreground">
                    Everyone gets an in-app notification. Turn this on to also send the post to their work email.
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Also email everyone" />
              </label>
            )}
          />
        )}
      </form>
    </ResponsiveDialog>
  )
}
