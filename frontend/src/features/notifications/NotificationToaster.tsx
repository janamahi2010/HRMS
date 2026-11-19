import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useUser } from '@/features/auth/AuthProvider'
import { useMarkRead, useNotificationSummary } from './api'
import { KindIcon } from './NotificationList'

const key = (uid: number) => `hrms-notified:${uid}`
const readLast = (uid: number) => {
  try {
    return Number(localStorage.getItem(key(uid))) || 0
  } catch {
    return 0
  }
}
const writeLast = (uid: number, id: number) => {
  try {
    localStorage.setItem(key(uid), String(id))
  } catch {
    /* private mode */
  }
}

/** Pops up the newest unread notification once (on sign-in and as new ones arrive), and keeps related screens fresh. */
export function NotificationToaster() {
  const user = useUser()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const summary = useNotificationSummary()
  const read = useMarkRead()
  const latest = summary.data?.latest
  const unread = summary.data?.unread ?? 0

  useEffect(() => {
    if (!latest || pathname === '/notifications' || pathname === '/change-password') return
    const last = readLast(user.id)
    if (latest.id <= last) return
    writeLast(user.id, latest.id)
    // Something happened elsewhere (approval, new request, news): refresh what's on screen.
    if (last) {
      qc.invalidateQueries({ queryKey: ['leave'] })
      qc.invalidateQueries({ queryKey: ['regularizations'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['news'] })
    }
    const more = unread - 1
    toast(latest.title, {
      id: 'app-notification',
      description: [latest.body, more > 0 ? `+${more} more unread` : ''].filter(Boolean).join(' · ') || undefined,
      icon: <KindIcon kind={latest.kind} className="size-7 [&_svg]:size-4" />,
      duration: 8_000,
      action: latest.link
        ? {
            label: 'View',
            onClick: () => {
              read.mutate(latest.id)
              navigate(latest.link)
            },
          }
        : undefined,
    })
  }, [latest, unread, pathname, user.id, navigate, qc, read])

  return null
}
