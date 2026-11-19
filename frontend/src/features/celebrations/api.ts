import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CelebrationPerson {
  id: number
  name: string
  designation: string
}

export interface Celebrations {
  date: string
  today: {
    user: CelebrationPerson
    is_me: boolean
    wishes_count: number
    wished_by_me: boolean
    /** Only present for the birthday person themselves. */
    wishes?: { id: number; from: CelebrationPerson; message: string; created_at: string }[]
  }[]
  upcoming: { user: CelebrationPerson; date: string; days_until: number }[]
  poster_url: string | null
  my_birthday_set: boolean
  my_birthday_visible: boolean
}

export const celebrationKeys = {
  all: ['celebrations'] as const,
  list: (days: number) => ['celebrations', days] as const,
}

export function useCelebrations(days = 14, enabled = true) {
  return useQuery({
    queryKey: celebrationKeys.list(days),
    queryFn: ({ signal }) => api.get<Celebrations>('/celebrations/', { params: { days }, signal }).then((r) => r.data),
    staleTime: 60_000,
    enabled,
  })
}

export function useSendWish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { to_user: number; message: string }) =>
      api.post<{ id: number; message: string }>('/celebrations/wishes/', body).then((r) => r.data),
    // Optimistic: the card flips to "Wished" and the count goes up immediately.
    onMutate: async ({ to_user }) => {
      await qc.cancelQueries({ queryKey: celebrationKeys.all })
      const snapshots = qc.getQueriesData<Celebrations>({ queryKey: celebrationKeys.all })
      qc.setQueriesData<Celebrations>({ queryKey: celebrationKeys.all }, (old) =>
        old
          ? {
              ...old,
              today: old.today.map((t) =>
                t.user.id === to_user && !t.wished_by_me ? { ...t, wished_by_me: true, wishes_count: t.wishes_count + 1 } : t,
              ),
            }
          : old,
      )
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => qc.invalidateQueries({ queryKey: celebrationKeys.all }),
  })
}
