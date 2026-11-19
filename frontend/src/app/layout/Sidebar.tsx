import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { BrandMark } from '@/components/BrandMark'
import { Tooltip } from '@/components/ui/tooltip'
import { useUser } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { navFor } from '../nav'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useUser()
  const items = navFor(user.role)

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
      aria-label="Main navigation"
    >
      <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'px-5')}>
        <BrandMark name={user.company.name} logoUrl={user.company.logo_url} showName={!collapsed} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon, preload }) => (
            <li key={to}>
              <Tooltip content={label} side="right" disabled={!collapsed}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  onPointerEnter={() => void preload?.()}
                  onFocus={() => void preload?.()}
                  aria-label={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-primary-soft text-primary-soft-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{label}</span>}
                </NavLink>
              </Tooltip>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={onToggle}
          className={cn(
            'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}
