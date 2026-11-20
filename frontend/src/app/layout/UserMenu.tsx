import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { pages } from '../pages'

export function UserMenu() {
  const user = useUser()
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open user menu"
        onPointerEnter={() => void pages.profile.preload()}
      >
        <Avatar name={user.name} seed={user.id} src={user.avatar_url} size="sm" />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium lg:block">{user.name}</span>
        <ChevronDown className="hidden size-4 text-muted-foreground lg:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3">
          <Avatar name={user.name} seed={user.id} src={user.avatar_url} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <div className="px-2.5 pb-2">
          <StatusBadge status={user.role} dot={false} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound />
          My profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={logout}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
