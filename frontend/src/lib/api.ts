import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { tokenStore } from './tokens'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
})

/** Separate instance so refresh calls never go through the refresh interceptor. */
const bare = axios.create({ baseURL: API_URL, timeout: 15_000 })

// ---------------------------------------------------------------------------
// Session-expired event: AuthProvider listens and logs the user out.
// ---------------------------------------------------------------------------
type Listener = () => void
const sessionExpiredListeners = new Set<Listener>()
export function onSessionExpired(fn: Listener) {
  sessionExpiredListeners.add(fn)
  return () => {
    sessionExpiredListeners.delete(fn)
  }
}
function emitSessionExpired() {
  sessionExpiredListeners.forEach((fn) => fn())
}

// ---------------------------------------------------------------------------
// Single-flight refresh: concurrent 401s share one refresh request.
// ---------------------------------------------------------------------------
let refreshPromise: Promise<string> | null = null

async function doRefresh(): Promise<string> {
  const used = tokenStore.getRefresh()
  if (!used) throw new Error('no-refresh-token')
  try {
    const { data } = await bare.post<{ access: string; refresh?: string }>('/auth/refresh/', { refresh: used })
    tokenStore.setAccess(data.access)
    if (data.refresh) tokenStore.setRefresh(data.refresh)
    return data.access
  } catch (err) {
    // Another tab may have rotated the token at the same moment. Retry once with the newer one.
    const latest = tokenStore.getRefresh()
    if (latest && latest !== used) {
      const { data } = await bare.post<{ access: string; refresh?: string }>('/auth/refresh/', { refresh: latest })
      tokenStore.setAccess(data.access)
      if (data.refresh) tokenStore.setRefresh(data.refresh)
      return data.access
    }
    throw err
  }
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// Exact public endpoints only: /auth/password/change/ is authenticated and must carry the token.
const PUBLIC_PATHS = [
  '/auth/login/',
  '/auth/signup/',
  '/auth/refresh/',
  '/auth/logout/',
  '/auth/password/forgot/',
  '/auth/password/validate/',
  '/auth/password/reset/',
]
const isPublic = (url?: string) => !!url && PUBLIC_PATHS.some((p) => url.startsWith(p))

api.interceptors.request.use(async (config) => {
  if (isPublic(config.url)) return config
  let token = tokenStore.getAccess()
  // After a page reload only the refresh token survives, so get a fresh access token first.
  if (!token && tokenStore.getRefresh()) {
    try {
      token = await refreshAccessToken()
    } catch {
      tokenStore.clear()
      emitSessionExpired()
    }
  }
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isPublic(original.url) &&
      tokenStore.getRefresh()
    ) {
      original._retry = true
      try {
        const token = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        tokenStore.clear()
        emitSessionExpired()
      }
    }
    return Promise.reject(error)
  },
)
