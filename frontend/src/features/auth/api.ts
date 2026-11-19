import { api } from '@/lib/api'
import type { AuthResponse, Me } from '@/lib/types'

export const authApi = {
  login: (body: { email: string; password: string }) => api.post<AuthResponse>('/auth/login/', body).then((r) => r.data),
  signup: (body: { company_name: string; name: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/signup/', body).then((r) => r.data),
  logout: (refresh: string) => api.post('/auth/logout/', { refresh }),
  me: () => api.get<Me>('/auth/me/').then((r) => r.data),
  updateMe: (body: Partial<Pick<Me, 'name' | 'phone' | 'date_of_birth' | 'show_birthday'>>) => api.patch<Me>('/auth/me/', body).then((r) => r.data),
  forgotPassword: (email: string) => api.post<{ detail: string }>('/auth/password/forgot/', { email }).then((r) => r.data),
  validateToken: (uid: string, token: string) =>
    api.post<{ email: string; name: string }>('/auth/password/validate/', { uid, token }).then((r) => r.data),
  resetPassword: (body: { uid: string; token: string; password: string }) =>
    api.post<AuthResponse>('/auth/password/reset/', body).then((r) => r.data),
  changePassword: (body: { current_password: string; new_password: string }) =>
    api.post<AuthResponse>('/auth/password/change/', body).then((r) => r.data),
}

export const meQueryKey = ['me'] as const
