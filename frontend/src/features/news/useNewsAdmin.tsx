import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUser } from '@/features/auth/AuthProvider'
import { getErrorMessage } from '@/lib/errors'
import { useDeleteNews, useSaveNews, type NewsPost } from './api'
import { NewsFormDialog } from './NewsFormDialog'

/** Admin-only edit / pin / delete for news posts, shared by the News page and the Home card. */
export function useNewsAdmin() {
  const isAdmin = useUser().role === 'admin'
  const save = useSaveNews()
  const del = useDeleteNews()
  const [editing, setEditing] = useState<NewsPost | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleting, setDeleting] = useState<NewsPost | null>(null)

  const actions = isAdmin
    ? {
        onEdit: (p: NewsPost) => {
          setEditing(p)
          setFormOpen(true)
        },
        onTogglePin: (p: NewsPost) =>
          save.mutate(
            { id: p.id, data: { is_pinned: !p.is_pinned } },
            {
              onSuccess: () => toast.success(p.is_pinned ? 'Unpinned' : 'Pinned to the top'),
              onError: (e) => toast.error(getErrorMessage(e)),
            },
          ),
        onDelete: (p: NewsPost) => setDeleting(p),
      }
    : undefined

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const dialogs = isAdmin ? (
    <>
      <NewsFormDialog open={formOpen} onOpenChange={setFormOpen} post={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this post?"
        description={deleting ? `"${deleting.title}" and its photos will be removed for everyone. This can't be undone.` : undefined}
        confirmLabel="Delete post"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Post deleted')
              setDeleting(null)
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </>
  ) : null

  return { isAdmin, actions, dialogs, openNew }
}
