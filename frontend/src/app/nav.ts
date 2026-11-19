import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Fingerprint,
  LayoutDashboard,
  Newspaper,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/types'
import { pages } from './pages'
import { warm } from './prefetch'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: Role[]
  preload?: () => Promise<unknown>
  /** Shown in the mobile bottom bar (max 4 + More) */
  mobile?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, preload: warm.dashboard, mobile: true },
  { to: '/attendance', label: 'Attendance', icon: Fingerprint, preload: warm.attendance, mobile: true },
  { to: '/leave', label: 'Leave', icon: CalendarDays, preload: warm.leave, mobile: true },
  { to: '/requests', label: 'Requests', icon: ClipboardList, preload: warm.requests, mobile: true },
  { to: '/news', label: 'News', icon: Newspaper, preload: warm.news },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['admin'], preload: pages.employees.preload },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'], preload: pages.reports.preload },
  { to: '/settings', label: 'Company settings', icon: Settings, roles: ['admin'], preload: pages.settings.preload },
]

export const navFor = (role: Role) => NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role))
