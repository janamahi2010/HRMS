import { ShieldX } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Role } from '@/lib/types'
import { AppShellSkeleton } from './layout/AppShellSkeleton'

/** UX-only guard. The backend independently enforces every permission. */
export function RequireAuth() {
  const { status, error, retry, logout, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AppShellSkeleton />
  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div>
          <ErrorState error={error} title="We couldn’t load your account" onRetry={retry} />
          <div className="-mt-6 text-center">
            <Button variant="link" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    )
  }
  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (user?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return <Outlet />
}

export function GuestOnly() {
  const { status } = useAuth()
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) {
    return (
      <EmptyState
        icon={ShieldX}
        title="You don’t have access to this page"
        description="This area is restricted to specific roles. If you think this is a mistake, contact your admin."
        action={
          <Button asChild variant="outline">
            <Link to="/">Go to home</Link>
          </Button>
        }
      />
    )
  }
  return <Outlet />
}
