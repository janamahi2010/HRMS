import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { GeoFix } from '@/hooks/useGeolocation'
import type { AttendanceRecord, MonthCalendar, TeamDay, TodayState } from '@/lib/types'

export const attendanceKeys = {
  all: ['attendance'] as const,
  today: ['attendance', 'today'] as const,
  calendar: (year: number, month: number, user?: number) => ['attendance', 'calendar', year, month, user ?? 'me'] as const,
  team: (date: string, search: string) => ['attendance', 'team', date, search] as const,
}

export const fetchToday = () => api.get<TodayState>('/attendance/today/').then((r) => r.data)

export function useToday() {
  return useQuery({
    queryKey: attendanceKeys.today,
    queryFn: fetchToday,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000, // picks up day rollover / admin changes
  })
}

export function useCalendar(year: number, month: number, user?: number) {
  return useQuery({
    queryKey: attendanceKeys.calendar(year, month, user),
    queryFn: ({ signal }) =>
      api.get<MonthCalendar>('/attendance/calendar/', { params: { year, month, user }, signal }).then((r) => r.data),
    placeholderData: (prev) => (prev && prev.user.id === (user ?? prev.user.id) ? prev : undefined),
  })
}

export function useTeamDay(date: string, search: string, enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.team(date, search),
    queryFn: ({ signal }) =>
      api.get<TeamDay>('/attendance/team/', { params: { date, search: search || undefined }, signal }).then((r) => r.data),
    placeholderData: (prev) => prev,
    enabled,
  })
}

export function usePunch(kind: 'check-in' | 'check-out') {
  const qc = useQueryClient()
  return useMutation({
    // `null` = no location (only allowed for people who can check in remotely).
    mutationFn: (fix: GeoFix | null) =>
      api
        .post<TodayState>(`/attendance/${kind}/`, fix ? { lat: fix.lat, lng: fix.lng, accuracy: Math.round(fix.accuracy * 10) / 10 } : {})
        .then((r) => r.data),
    onSuccess: (state) => {
      qc.setQueryData(attendanceKeys.today, state) // instant card update, no refetch
      qc.invalidateQueries({ queryKey: ['attendance', 'calendar'] })
      qc.invalidateQueries({ queryKey: ['attendance', 'team'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** Save my own work summary (today by default). Updates every cached copy of that day in place. */
export function useSaveWorkSummary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ summary, date }: { summary: string; date?: string }) =>
      api.put<AttendanceRecord>('/attendance/work-summary/', { summary, date }).then((r) => r.data),
    onSuccess: (rec) => {
      qc.setQueryData<TodayState>(attendanceKeys.today, (old) => (old && old.record?.id === rec.id ? { ...old, record: rec } : old))
      qc.invalidateQueries({ queryKey: ['attendance', 'calendar'] })
      qc.invalidateQueries({ queryKey: ['attendance', 'team'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

/** Current time corrected to the server clock (device clocks drift / get set wrong). */
export function useServerNow(serverTime: string | undefined, fetchedAt: number, tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(t)
  }, [tickMs])
  const offset = serverTime ? Date.parse(serverTime) - fetchedAt : 0
  return new Date(now + offset)
}
