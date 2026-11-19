import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { onSessionExpired } from '@/lib/api'
import { tokenStore } from '@/lib/tokens'
import type { AuthResponse, Me, Role } from '@/lib/types'
import { authApi, meQueryKey } from './api'

type Status = 'loading' | 'authenticated' | 'guest' | 'error'

interface AuthCtx {
  status: Status
  user: Me | null
  error: unknown
  retry: () => void
  /** Store tokens + user from any auth response (login, signup, reset, change password). */
  establishSession: (res: AuthResponse) => void
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [hasSession, setHasSession] = useState(() => !!tokenStore.getRefresh())

  const me = useQuery({
    queryKey: meQueryKey,
    queryFn: authApi.me,
    enabled: hasSession,
    staleTime: 5 * 60_000,
  })

  const clearLocal = useCallback(() => {
    tokenStore.clear()
    setHasSession(false)
    qc.clear()
  }, [qc])

  const establishSession = useCallback(
    (res: AuthResponse) => {
      tokenStore.set(res.access, res.refresh)
      qc.setQueryData(meQueryKey, res.user)
      setHasSession(true)
    },
    [qc],
  )

  const logout = useCallback(() => {
    const refresh = tokenStore.getRefresh()
    if (refresh) authApi.logout(refresh).catch(() => undefined) // fire & forget
    clearLocal()
  }, [clearLocal])

  // Refresh failed anywhere in the app → back to login.
  const expiredNotified = useRef(false)
  useEffect(
    () =>
      onSessionExpired(() => {
        clearLocal()
        if (!expiredNotified.current) {
          expiredNotified.current = true
          toast.error('Your session has expired. Please sign in again.')
          setTimeout(() => (expiredNotified.current = false), 3000)
        }
      }),
    [clearLocal],
  )

  // Cross-tab sync: logging out (or in) in one tab updates the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== tokenStore.REFRESH_KEY) return
      if (!e.newValue) {
        tokenStore.setAccess(null)
        setHasSession(false)
        qc.clear()
      } else if (!e.oldValue) {
        tokenStore.setAccess(null)
        setHasSession(true)
        qc.invalidateQueries({ queryKey: meQueryKey })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [qc])

  let status: Status
  if (!hasSession) status = 'guest'
  else if (me.data) status = 'authenticated'
  else if (me.isError) status = 'error'
  else status = 'loading'

  const user = hasSession ? (me.data ?? null) : null
  const { refetch, error } = me

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      error,
      retry: () => void refetch(),
      establishSession,
      logout,
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [status, user, error, refetch, establishSession, logout],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** Convenience for pages behind RequireAuth, where the user is guaranteed. */
export function useUser(): Me {
  const { user } = useAuth()
  if (!user) throw new Error('useUser called without an authenticated user')
  return user
}
