import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useUser } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { NotificationToaster } from '@/features/notifications/NotificationToaster'
import { BottomNav } from './BottomNav'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'

const COLLAPSE_KEY = 'hrms-sidebar-collapsed'

export function AppLayout() {
  const user = useUser()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }, [])

  // Scroll to top on navigation.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-md"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200 ease-out', collapsed ? 'md:pl-[72px]' : 'md:pl-60')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6 md:h-16 lg:px-8">
          <BrandMark name={user.company.name} logoUrl={user.company.logo_url} className="md:hidden" />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-28 sm:px-6 sm:pt-6 md:pb-10 lg:px-8">
          <RouteErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>

      <BottomNav />
      <NotificationToaster />
    </div>
  )
}
