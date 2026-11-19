/**
 * Hover/focus/touch prefetch for nav links: warm both the route chunk and the page's
 * first query, so navigation renders real data instead of a skeleton.
 * Query keys + params must match what each page requests.
 */
import { api } from '@/lib/api'
import { parseISODate, todayIST } from '@/lib/date'
import { queryClient } from '@/lib/queryClient'
import type { LeaveBalance, MonthCalendar, Paginated, TodayState } from '@/lib/types'
import { pages } from './pages'

const STALE = 30_000
const prefetch = (queryKey: readonly unknown[], url: string, params?: Record<string, unknown>) =>
  queryClient.prefetchQuery({ queryKey, queryFn: () => api.get(url, { params }).then((r) => r.data), staleTime: STALE })

const ym = () => {
  const d = parseISODate(todayIST())
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

const settle = (...ps: Promise<unknown>[]) => Promise.allSettled(ps)

export const warm = {
  dashboard: () =>
    settle(
      pages.dashboard.preload(),
      prefetch(['dashboard'], '/dashboard/'),
      prefetch(['celebrations', 14], '/celebrations/', { days: 14 }),
      prefetch(['news', 'list', 'all', 1, 3], '/news/', { page: 1, page_size: 3 }),
    ),
  news: () => settle(pages.news.preload(), prefetch(['news', 'list', 'all', 1, 10], '/news/', { page: 1, page_size: 10 })),
  attendance: () => {
    const { year, month } = ym()
    return settle(
      pages.attendance.preload(),
      prefetch(['attendance', 'today'], '/attendance/today/') as Promise<TodayState | void>,
      prefetch(['attendance', 'calendar', year, month, 'me'], '/attendance/calendar/', { year, month }) as Promise<MonthCalendar | void>,
    )
  },
  leave: () =>
    settle(
      pages.leave.preload(),
      prefetch(['leave', 'balances', 'me', 'current'], '/leave/balances/') as Promise<LeaveBalance[] | void>,
      prefetch(['leave', 'requests', { scope: 'mine', status: 'all', search: '', page: 1 }], '/leave/requests/', { scope: 'mine', page: 1 }) as Promise<
        Paginated<unknown> | void
      >,
    ),
  requests: () =>
    settle(
      pages.requests.preload(),
      prefetch(['regularizations', { scope: 'mine', status: 'all', search: '', page: 1 }], '/regularizations/', { scope: 'mine', page: 1 }),
    ),
}
