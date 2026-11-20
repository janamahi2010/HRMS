import { ChevronRight, LogOut, Menu, UserRound } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { navFor } from '../nav'
import { pages } from '../pages'
import { ThemeSegmented } from './ThemeToggle'

const tabClass = (active: boolean) =>
  cn(
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
    active ? 'text-primary' : 'text-muted-foreground active:text-foreground',
  )

export function BottomNav() {
  const user = useUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const all = navFor(user.role)
  const tabs = all.filter((i) => i.mobile)
  const extra = all.filter((i) => !i.mobile)
  const moreActive = extra.some((i) => location.pathname.startsWith(i.to)) || location.pathname.startsWith('/profile')

  const go = (to: string) => {
    setMoreOpen(false)
    navigate(to)
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-card/85 md:hidden"
        aria-label="Main navigation"
      >
        <ul className="flex">
          {tabs.map(({ to, label, icon: Icon, preload }) => (
            <li key={to} className="flex flex-1">
              <NavLink to={to} end={to === '/'} onTouchStart={() => void preload?.()} className={({ isActive }) => tabClass(isActive)}>
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150',
                        isActive && 'bg-primary-soft',
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li className="flex flex-1">
            <button onClick={() => setMoreOpen(true)} className={tabClass(moreActive)} aria-haspopup="dialog">
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-primary-soft')}>
                <Menu className="size-5" aria-hidden />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="sr-only">More</SheetTitle>
            <SheetDescription className="sr-only">Additional navigation and settings</SheetDescription>
            <button onClick={() => go('/profile')} onTouchStart={() => void pages.profile.preload()} className="flex items-center gap-3 rounded-xl text-left">
              <Avatar name={user.name} seed={user.id} src={user.avatar_url} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{user.name}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <StatusBadge status={user.role} dot={false} className="mt-1" />
              </div>
            </button>
          </SheetHeader>
          <SheetBody className="space-y-5 pb-6">
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {[...extra, { to: '/profile', label: 'My profile', icon: UserRound, preload: pages.profile.preload }].map(
                ({ to, label, icon: Icon, preload }) => (
                  <li key={to} className="border-b border-border last:border-0">
                    <button
                      onClick={() => go(to)}
                      onTouchStart={() => void preload?.()}
                      className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-medium active:bg-accent"
                    >
                      <Icon className="size-5 text-muted-foreground" aria-hidden />
                      <span className="flex-1">{label}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ),
              )}
            </ul>
            <div>
              <p className="mb-2 text-[13px] font-medium text-muted-foreground">Appearance</p>
              <ThemeSegmented />
            </div>
            <button
              onClick={() => {
                setMoreOpen(false)
                logout()
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-[15px] font-medium text-destructive active:bg-accent"
            >
              <LogOut className="size-5" aria-hidden />
              Sign out
            </button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}
