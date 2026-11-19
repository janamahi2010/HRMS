import { ExternalLink, MapPin, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import type { OfficeLocation } from '@/lib/types'
import { pluralize } from '@/lib/utils'
import { useDeleteLocation, useLocations } from './api'
import { LocationDialog } from './LocationDialog'

export function LocationsTab() {
  const locations = useLocations()
  const del = useDeleteLocation()
  const [editing, setEditing] = useState<OfficeLocation | null>(null)
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<OfficeLocation | null>(null)

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }
  // Warm the Leaflet chunk while the admin moves toward the button.
  const preloadMap = () => void import('./LocationPicker')

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Check-ins are verified on the server against the employee’s assigned office.</p>
        <Button onClick={openNew} onPointerEnter={preloadMap} onFocus={preloadMap} className="max-sm:w-full">
          <Plus /> Add location
        </Button>
      </div>

      {locations.isPending ? (
        <SkeletonGroup className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </Card>
          ))}
        </SkeletonGroup>
      ) : locations.isError ? (
        <Card>
          <ErrorState error={locations.error} onRetry={() => locations.refetch()} />
        </Card>
      ) : locations.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="No office locations yet"
            description="Add your office and pin it on the map so your team can check in."
            action={
              <Button onClick={openNew} onPointerEnter={preloadMap}>
                <Plus /> Add location
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {locations.data.map((l) => (
            <li key={l.id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <MapPin className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{l.name}</h2>
                      {!l.is_active && <Badge>Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{l.address || 'No address'}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${l.name}`} onPointerEnter={preloadMap}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(l)
                          setOpen(true)
                        }}
                      >
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem destructive onSelect={() => setToDelete(l)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full border-2 border-primary" aria-hidden />
                    {l.radius_m} m radius
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" aria-hidden />
                    {pluralize(l.employee_count, 'employee')}
                  </span>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=18/${l.latitude}/${l.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    View map <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <LocationDialog open={open} onOpenChange={setOpen} location={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ''}?`}
        description={
          toDelete?.employee_count
            ? `${pluralize(toDelete.employee_count, 'employee')} assigned here will have no office and won’t be able to check in until you assign a new one.`
            : 'This can’t be undone.'
        }
        confirmLabel="Delete location"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success(`${toDelete.name} deleted`)
              setToDelete(null)
            },
            onError: (err) => toast.error(getErrorMessage(err)),
          })
        }
      />
    </>
  )
}
