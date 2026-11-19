import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarHeart, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { parseISODate, todayIST } from '@/lib/date'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { Holiday } from '@/lib/types'
import { format } from 'date-fns'
import { useDeleteHoliday, useHolidays, useSaveHoliday } from './api'

export function HolidaysTab() {
  const thisYear = Number(todayIST().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const holidays = useHolidays(year)
  const del = useDeleteHoliday()
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Holiday | null>(null)
  const today = todayIST()

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <ChevronLeft />
          </Button>
          <span className="tabular w-14 text-center text-lg font-semibold" aria-live="polite">
            {year}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
            <ChevronRight />
          </Button>
        </div>
        <Button onClick={openNew}>
          <Plus /> Add holiday
        </Button>
      </div>

      {holidays.isPending ? (
        <SkeletonGroup>
          <Card className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="size-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </Card>
        </SkeletonGroup>
      ) : holidays.isError ? (
        <Card>
          <ErrorState error={holidays.error} onRetry={() => holidays.refetch()} />
        </Card>
      ) : holidays.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarHeart}
            title={`No holidays for ${year}`}
            description="Holidays block check-ins and are skipped when counting leave days."
            action={
              <Button onClick={openNew}>
                <Plus /> Add holiday
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {holidays.data.map((h) => {
              const d = parseISODate(h.date)
              const past = h.date < today
              return (
                <li key={h.id} className="flex items-center gap-4 p-4">
                  <div
                    className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl ${past ? 'bg-muted text-muted-foreground' : 'bg-primary-soft text-primary-soft-foreground'}`}
                  >
                    <span className="text-[10px] font-semibold uppercase leading-none">{format(d, 'MMM')}</span>
                    <span className="tabular text-lg font-semibold leading-tight">{format(d, 'd')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${past ? 'text-muted-foreground' : ''}`}>{h.name}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {format(d, 'EEEE')}
                      {h.date === today && (
                        <Badge tone="primary" className="ml-2">
                          Today
                        </Badge>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${h.name}`}
                    onClick={() => {
                      setEditing(h)
                      setOpen(true)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${h.name}`} onClick={() => setToDelete(h)}>
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <HolidayDialog open={open} onOpenChange={setOpen} holiday={editing} defaultYear={year} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ''}?`}
        description="Employees will be able to check in on this date and it will count toward leave days."
        confirmLabel="Delete holiday"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success('Holiday deleted')
              setToDelete(null)
            },
            onError: (err) => toast.error(getErrorMessage(err)),
          })
        }
      />
    </>
  )
}

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  date: z.string().min(1, 'Pick a date'),
})
type Values = z.infer<typeof schema>

function HolidayDialog({
  open,
  onOpenChange,
  holiday,
  defaultYear,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  holiday: Holiday | null
  defaultYear: number
}) {
  const save = useSaveHoliday()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', date: '' } })

  useEffect(() => {
    if (open) form.reset(holiday ? { name: holiday.name, date: holiday.date } : { name: '', date: '' })
  }, [open, holiday, form])

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      { id: holiday?.id, data: v },
      {
        onSuccess: () => {
          toast.success(holiday ? 'Holiday updated' : 'Holiday added')
          onOpenChange(false)
        },
        onError: (err) => {
          if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
        },
      },
    ),
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={holiday ? 'Edit holiday' : 'Add holiday'}
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={save.isPending}>
            {holiday ? 'Save' : 'Add holiday'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField label="Holiday name" error={form.formState.errors.name?.message}>
          <Input placeholder="Diwali" autoFocus {...form.register('name')} />
        </FormField>
        <FormField label="Date" error={form.formState.errors.date?.message}>
          <Input type="date" min={`${defaultYear - 1}-01-01`} {...form.register('date')} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
