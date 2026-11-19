import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { meQueryKey } from '@/features/auth/api'
import { api } from '@/lib/api'
import type { CompanyMini, CompanySettings, Holiday, OfficeLocation } from '@/lib/types'

export const settingsKeys = {
  company: ['company'] as const,
  settings: ['company-settings'] as const,
  locations: ['locations'] as const,
  holidays: (year: number) => ['holidays', year] as const,
}

// --- Company ------------------------------------------------------------
export function useCompany() {
  return useQuery({ queryKey: settingsKeys.company, queryFn: () => api.get<CompanyMini>('/company/').then((r) => r.data) })
}

export function useUpdateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string }) => api.patch<CompanyMini>('/company/', data).then((r) => r.data),
    onSuccess: (c) => {
      qc.setQueryData(settingsKeys.company, c)
      qc.invalidateQueries({ queryKey: meQueryKey }) // sidebar brand
    },
  })
}

export function useUploadLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('logo', file)
      return api.post<CompanyMini>('/company/logo/', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
    },
    onSuccess: (c) => {
      qc.setQueryData(settingsKeys.company, c)
      qc.invalidateQueries({ queryKey: meQueryKey })
    },
  })
}

export function useRemoveLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete('/company/logo/'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.company })
      qc.invalidateQueries({ queryKey: meQueryKey })
    },
  })
}

export function useUploadPoster() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('poster', file)
      return api
        .post<CompanyMini>('/company/birthday-poster/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data)
    },
    onSuccess: (c) => {
      qc.setQueryData(settingsKeys.company, c)
      qc.invalidateQueries({ queryKey: ['celebrations'] })
    },
  })
}

export function useRemovePoster() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete('/company/birthday-poster/'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.company })
      qc.invalidateQueries({ queryKey: ['celebrations'] })
    },
  })
}

// --- Work rules ----------------------------------------------------------
export function useCompanySettings() {
  return useQuery({
    queryKey: settingsKeys.settings,
    queryFn: () => api.get<CompanySettings>('/company/settings/').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Omit<CompanySettings, 'default_cc_users' | 'backup_approver_user'>>) =>
      api.patch<CompanySettings>('/company/settings/', data).then((r) => r.data),
    onSuccess: (s) => qc.setQueryData(settingsKeys.settings, s),
  })
}

// --- Locations ---------------------------------------------------------
export type LocationInput = Pick<OfficeLocation, 'name' | 'address' | 'radius_m' | 'is_active'> & {
  latitude: number
  longitude: number
}

export function useLocations() {
  return useQuery({
    queryKey: settingsKeys.locations,
    queryFn: () => api.get<OfficeLocation[]>('/company/locations/').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useSaveLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: LocationInput }) =>
      (id
        ? api.patch<OfficeLocation>(`/company/locations/${id}/`, data)
        : api.post<OfficeLocation>('/company/locations/', data)
      ).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.locations }),
  })
}

export function useDeleteLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/company/locations/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.locations })
      qc.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

// --- Holidays ----------------------------------------------------------
export function useHolidays(year: number) {
  return useQuery({
    queryKey: settingsKeys.holidays(year),
    queryFn: () => api.get<Holiday[]>('/company/holidays/', { params: { year } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useSaveHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Omit<Holiday, 'id'> }) =>
      (id ? api.patch<Holiday>(`/company/holidays/${id}/`, data) : api.post<Holiday>('/company/holidays/', data)).then(
        (r) => r.data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  })
}

export function useDeleteHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/company/holidays/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  })
}
