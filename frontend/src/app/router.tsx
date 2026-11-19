import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { GuestOnly, RequireAuth, RequireRole } from './guards'
import { AppShellSkeleton } from './layout/AppShellSkeleton'
import { pages as P } from './pages'

// The signed-in shell (sidebar, nav, prefetchers) is its own chunk, so the login page stays light.
const AppLayout = lazy(() => import('./layout/AppLayout').then((m) => ({ default: m.AppLayout })))

function AuthPageFallback() {
  return (
    <SkeletonGroup label="Loading" className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[400px] space-y-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-6 h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </SkeletonGroup>
  )
}

function PublicShell() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <PublicShell />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <P.login /> },
          { path: '/signup', element: <P.signup /> },
          { path: '/forgot-password', element: <P.forgotPassword /> },
        ],
      },
      // Reachable whether or not someone is signed in (e.g. opening an invite on a shared device).
      { path: '/reset-password', element: <P.resetPassword mode="reset" /> },
      { path: '/set-password', element: <P.resetPassword mode="invite" /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      // Full-screen (no sidebar): forced password change after an admin-set password.
      {
        path: '/change-password',
        element: (
          <Suspense fallback={<AuthPageFallback />}>
            <P.changePasswordRequired />
          </Suspense>
        ),
      },
      {
        element: (
          <Suspense fallback={<AppShellSkeleton />}>
            <AppLayout />
          </Suspense>
        ),
        children: [
          { index: true, element: <P.dashboard /> },
          { path: '/attendance', element: <P.attendance /> },
          { path: '/leave', element: <P.leave /> },
          { path: '/requests', element: <P.requests /> },
          { path: '/news', element: <P.news /> },
          { path: '/notifications', element: <P.notifications /> },
          { path: '/profile', element: <P.profile /> },
          {
            element: <RequireRole roles={['admin', 'manager']} />,
            children: [
              { path: '/reports', element: <P.reports /> },
              { path: '/employees/:id', element: <P.employeeProfile /> },
            ],
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              { path: '/employees', element: <P.employees /> },
              { path: '/settings', element: <P.settings /> },
            ],
          },
          { path: '*', element: <P.notFound /> },
        ],
      },
    ],
  },
])
