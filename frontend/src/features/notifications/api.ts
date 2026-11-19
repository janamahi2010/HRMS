import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@/lib/types'

export type NotificationKind =
  | 'leave_applied'
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_cancelled'
  | 'leave_cc'
  | 'request_submitted'
  | 'request_approved'
  | 'request_rejected'
  | 'news'
  | 'birthday'
  | 'birthday_self'
  | 'birthday_wish'
  | 'checkout_reminder'
  | 'missed_checkout'

export interface AppNotification {
  id: number
  kind: NotificationKind
  title: string
  body: string
  link: string
  actor: { id: number; name: string } | null
  is_read: boolean
  created_at: string
}

export interface NotificationSummary {
  unread: number
  latest: AppNotification | null
}

export type NotificationFilter = 'all' | 'unread'

export const notifKeys = {
  all: ['notifications'] as const,
  summary: ['notifications', 'summary'] as const,
  list: (filter: NotificationFilter, page: number) => ['notifications', 'list', filter, page] as const,
}

/** Bell count. Checked every 30 s and when the tab regains focus. */
export function useNotificationSummary() {
  return useQuery({
    queryKey: notifKeys.summary,
    queryFn: () => api.get<NotificationSummary>('/notifications/summary/').then((r) => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
}

export function useNotifications(filter: NotificationFilter, page = 1, enabled = true) {
  return useQuery({
    queryKey: notifKeys.list(filter, page),
    queryFn: ({ signal }) =>
      api
        .get<Paginated<AppNotification>>('/notifications/', { params: { filter: filter === 'all' ? undefined : filter, page }, signal })
        .then((r) => r.data),
    enabled,
    placeholderData: (prev) => prev,
  })
}

/** Optimistically patch every cached list + the count, then resync with the server. */
function useNotifMutation<TVar>(fn: (v: TVar) => Promise<unknown>, patch: (n: AppNotification, v: TVar) => AppNotification | null, countDelta: (v: TVar, qc: ReturnType<typeof useQueryClient>) => number | 'zero') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onMutate: async (v: TVar) => {
      await qc.cancelQueries({ queryKey: notifKeys.all })
      const delta = countDelta(v, qc)
      qc.setQueryData<NotificationSummary>(notifKeys.summary, (s) =>
        s ? { unread: delta === 'zero' ? 0 : Math.max(0, s.unread + delta), latest: delta === 'zero' ? null : s.latest } : s,
      )
      qc.setQueriesData<Paginated<AppNotification>>({ queryKey: ['notifications', 'list'] }, (d) =>
        d ? { ...d, results: d.results.map((n) => patch(n, v)).filter((n): n is AppNotification => n !== null) } : d,
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: notifKeys.all }),
  })
}

const findCached = (qc: ReturnType<typeof useQueryClient>, id: number) => {
  for (const [, d] of qc.getQueriesData<Paginated<AppNotification>>({ queryKey: ['notifications', 'list'] })) {
    const hit = d?.results.find((n) => n.id === id)
    if (hit) return hit
  }
  return undefined
}

export function useMarkRead() {
  return useNotifMutation(
    (id: number) => api.post(`/notifications/${id}/read/`),
    (n, id) => (n.id === id ? { ...n, is_read: true } : n),
    (id, qc) => (findCached(qc, id)?.is_read === false || !findCached(qc, id) ? -1 : 0),
  )
}

export function useMarkUnread() {
  return useNotifMutation(
    (id: number) => api.post(`/notifications/${id}/unread/`),
    (n, id) => (n.id === id ? { ...n, is_read: false } : n),
    () => 1,
  )
}

export function useReadAll() {
  return useNotifMutation(
    () => api.post('/notifications/read-all/'),
    (n) => ({ ...n, is_read: true }),
    () => 'zero',
  )
}

export function useDeleteNotification() {
  return useNotifMutation(
    (id: number) => api.delete(`/notifications/${id}/`),
    (n, id) => (n.id === id ? null : n),
    (id, qc) => (findCached(qc, id)?.is_read === false ? -1 : 0),
  )
}

export function useClearRead() {
  return useNotifMutation(
    () => api.post('/notifications/clear-read/'),
    (n) => (n.is_read ? null : n),
    () => 0,
  )
}
