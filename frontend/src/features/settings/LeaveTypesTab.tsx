import { zodResolver } from '@hookform/resolvers/zod'
import { MoreHorizontal, Palmtree, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ChoiceCards } from '@/features/employees/AdminPassword'
import { useDeleteLeaveType, useLeaveTypes, useSaveLeaveType } from '@/features/leave/api'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { LeaveType } from '@/lib/types'
import { cn } from '@/lib/utils'

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(50),
  yearly_quota: z.coerce.number<number>().min(0, "Can't be negative").max(365),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  allow_half_day: z.boolean(),
  is_paid: z.boolean(),
  is_active: z.boolean(),
  accrual: z.enum(['yearly', 'monthly']),
})
type Values = z.infer<typeof schema>

const perMonth = (q: number | string) => {
  const v = Number(q) / 12
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')} day${v === 1 ? '' : 's'}`
}

const toValues = (t?: LeaveType | null): Values => ({
  name: t?.name ?? '',
  yearly_quota: t ? Number(t.yearly_quota) : 12,
  color: t?.color ?? COLORS[0]!,
  allow_half_day: t?.allow_half_day ?? true,
  is_paid: t?.is_paid ?? true,
  is_active: t?.is_active ?? true,
  accrual: t?.accrual ?? 'yearly',
})

export function LeaveTypesTab() {
  const q = useLeaveTypes()
  const del = useDeleteLeaveType()
  const save = useSaveLeaveType()
  const [editing, setEditing] = useState<LeaveType | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<LeaveType | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Each type is credited either all at once on 1 January, or a twelfth on the 1st of every month. New joiners get a pro-rata share.
        </p>
        <Button onClick={() => setEditing(null)}>
          <Plus /> Add leave type
        </Button>
      </div>

      {q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="flex items-center gap-3 p-4">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </Card>
          ))}
        </div>
      ) : !q.data?.length ? (
        <Card>
          <EmptyState icon={Palmtree} title="No leave types" description="Add the kinds of leave your team can take." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.data.map((t) => (
            <Card key={t.id} className={cn('flex items-center gap-3 p-4', !t.is_active && 'opacity-60')}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${t.color}1f`, color: t.color }}>
                <Palmtree className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  {t.name}
                  {t.is_paid && t.accrual === 'monthly' && <Badge tone="info">Monthly</Badge>}
                  {!t.is_active && <Badge>Inactive</Badge>}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {t.is_paid ? `${Number(t.yearly_quota)} days / year` : 'Unpaid · no limit'}
                  {t.is_paid && (t.accrual === 'monthly' ? ` · ${perMonth(t.yearly_quota)} a month` : ' · all in January')}
                  {t.allow_half_day ? ' · half days allowed' : ' · full days only'}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(t)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      save.mutate(
                        { id: t.id, data: { is_active: !t.is_active } },
                        {
                          onSuccess: () => toast.success(`${t.name} ${t.is_active ? 'deactivated' : 'activated'}`),
                          onError: (e) => toast.error(getErrorMessage(e)),
                        },
                      )
                    }
                  >
                    {t.is_active ? 'Deactivate' : 'Activate'}
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setDeleting(t)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}

      <LeaveTypeDialog type={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Only types that were never used can be deleted. Used types can be deactivated instead."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => toast.success(`${deleting.name} deleted`),
            onError: (e) => toast.error(getErrorMessage(e)),
            onSettled: () => setDeleting(null),
          })
        }
      />
    </div>
  )
}

function LeaveTypeDialog({ type, onClose }: { type: LeaveType | null | undefined; onClose: () => void }) {
  const open = type !== undefined
  const save = useSaveLeaveType()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(type) })
  const { register, control, handleSubmit, formState, reset, watch } = form
  const paid = watch('is_paid')
  const quota = watch('yearly_quota')
  const accrualChanged = !!type && type.is_paid && watch('accrual') !== type.accrual
  useEffect(() => {
    if (open) reset(toValues(type))
  }, [open, type, reset])

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      { id: type?.id, data: { ...v, yearly_quota: String(v.is_paid ? v.yearly_quota : 0) } },
      {
        onSuccess: (t) => {
          toast.success(type ? `${t.name} updated` : `${t.name} added and credited to everyone`)
          onClose()
        },
        onError: (err) => {
          if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
        },
      },
    ),
  )

  const toggle = (name: 'is_paid' | 'allow_half_day' | 'is_active', label: string, hint: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-[13px] text-muted-foreground">{hint}</span>
          </span>
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        </label>
      )}
    />
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={type ? `Edit ${type.name}` : 'Add leave type'}
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={save.isPending}>
            {type ? 'Save changes' : 'Add type'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <FormField label="Name" error={formState.errors.name?.message}>
            <Input placeholder="e.g. Comp Off" {...register('name')} />
          </FormField>
          <FormField label="Days / year" error={formState.errors.yearly_quota?.message}>
            <Input type="number" inputMode="decimal" step="0.5" min={0} disabled={!paid} {...register('yearly_quota')} />
          </FormField>
        </div>
        {paid && (
          <Controller
            control={control}
            name="accrual"
            render={({ field }) => (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">How it's credited</legend>
                <ChoiceCards
                  label="How it's credited"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    ['yearly', 'Yearly', `All ${Number(quota) || 0} days on 1 January`],
                    ['monthly', 'Monthly', `${perMonth(Number(quota) || 0)} on the 1st of each month`],
                  ]}
                />
                {accrualChanged && (
                  <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-soft-foreground">
                    This year's balances will be recalculated:{' '}
                    {field.value === 'monthly' ? 'everyone keeps only the months so far, plus any manual adjustments.' : 'everyone gets the full year now, plus any manual adjustments.'}
                  </p>
                )}
              </fieldset>
            )}
          />
        )}
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Color</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c}
                    aria-label={c}
                    onClick={() => field.onChange(c)}
                    className={cn('size-9 rounded-full ring-offset-2 ring-offset-card transition', field.value === c && 'ring-2 ring-foreground')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </fieldset>
          )}
        />
        <div className="divide-y divide-border rounded-xl border border-border px-3">
          {toggle('is_paid', 'Paid leave', 'Unpaid leave has no balance limit')}
          {toggle('allow_half_day', 'Allow half days', 'Employees can take the first or second half')}
          {toggle('is_active', 'Active', 'Inactive types are hidden from the apply form')}
        </div>
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
