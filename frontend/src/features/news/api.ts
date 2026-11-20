import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@/lib/types'

export type NewsCategory = 'news' | 'announcement' | 'event' | 'mou' | 'achievement'

export interface NewsImage {
  id: number
  url: string
  width: number
  height: number
}

export interface NewsAttachment {
  id: number
  name: string
  size: number
  content_type: string
  url: string
}

export interface NewsPost {
  id: number
  title: string
  body: string
  category: NewsCategory
  category_label: string
  event_date: string | null
  is_pinned: boolean
  author: { id: number; name: string; designation: string; avatar_url?: string | null } | null
  images: NewsImage[]
  attachments: NewsAttachment[]
  created_at: string
  updated_at: string
}

export const NEWS_CATEGORIES: { value: NewsCategory; label: string }[] = [
  { value: 'news', label: 'News' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'event', label: 'Event / program' },
  { value: 'mou', label: 'MoU / partnership' },
  { value: 'achievement', label: 'Achievement' },
]

export const MAX_PHOTOS = 6
export const MAX_DOCS = 3

export const newsKeys = {
  all: ['news'] as const,
  list: (category: string, page: number, pageSize: number) => ['news', 'list', category, page, pageSize] as const,
  unread: ['news', 'unread'] as const,
}

export function useNews(category: NewsCategory | 'all', page: number, pageSize = 10) {
  return useQuery({
    queryKey: newsKeys.list(category, page, pageSize),
    queryFn: ({ signal }) =>
      api
        .get<Paginated<NewsPost>>('/news/', { params: { category: category === 'all' ? undefined : category, page, page_size: pageSize }, signal })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  })
}

export interface NewsInput {
  title: string
  body: string
  category: NewsCategory
  event_date: string | null
  is_pinned: boolean
  new_images: File[]
  remove_image_ids: number[]
  new_files: File[]
  remove_file_ids: number[]
  /** Create only: also email everyone. */
  email_everyone: boolean
}

function toForm(v: Partial<NewsInput>) {
  const fd = new FormData()
  if (v.title !== undefined) fd.append('title', v.title)
  if (v.body !== undefined) fd.append('body', v.body)
  if (v.category !== undefined) fd.append('category', v.category)
  if (v.event_date !== undefined) fd.append('event_date', v.event_date ?? '')
  if (v.is_pinned !== undefined) fd.append('is_pinned', String(v.is_pinned))
  if (v.email_everyone) fd.append('email_everyone', 'true')
  for (const f of v.new_images ?? []) fd.append('new_images', f)
  for (const id of v.remove_image_ids ?? []) fd.append('remove_image_ids', String(id))
  for (const f of v.new_files ?? []) fd.append('new_files', f)
  for (const id of v.remove_file_ids ?? []) fd.append('remove_file_ids', String(id))
  return fd
}

export function useSaveNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Partial<NewsInput> }) => {
      const cfg = { headers: { 'Content-Type': 'multipart/form-data' } }
      return (id ? api.patch<NewsPost>(`/news/${id}/`, toForm(data), cfg) : api.post<NewsPost>('/news/', toForm(data), cfg)).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: newsKeys.all }),
  })
}

export function useDeleteNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/news/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: newsKeys.all }),
  })
}

export interface NewsUnread {
  count: number
  latest: NewsPost | null
}

/** Unread company news for the nav badge and the "new post" pop-up. Checked every minute and on focus. */
export function useNewsUnread() {
  return useQuery({
    queryKey: newsKeys.unread,
    queryFn: () => api.get<NewsUnread>('/news/unread/').then((r) => r.data),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })
}

export function useMarkNewsSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/news/seen/'),
    onMutate: () => qc.setQueryData<NewsUnread>(newsKeys.unread, { count: 0, latest: null }),
  })
}

/** Kept for older imports: the shared helper lives in lib/upload. */
export { shrinkPhoto } from '@/lib/upload'
