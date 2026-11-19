import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CalendarRange, Loader2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { UserPicker, type PickedUser } from '@/components/UserPicker'
import { useUser } from '@/features/auth/AuthProvider'
import { useCompanySettings } from '@/features/settings/api'
import { useDebounce } from '@/hooks/useDebounce'
import { parseISODate, todayIST } from '@/lib/date'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useApplyLeave, useBalances, useLeavePreview, useLeaveTypes, type PreviewInput } from './api'

const schema = z
  .object({
    leave_type: z.string().min(1, 'Choose a leave type'),
    from_date: z.string().min(1, 'Pick a start date'),
    to_date: z.string().min(1, 'Pick an end date'),
    is_half_day: z.boolean(),
    half: z.enum(['', 'first', 'second']),
    reason: z.string().trim().min(3, 'Add a short reason').max(1000),
    cc: z.array(z.custom<PickedUser>()),
  })
  .refine((v) => v.to_date >= v.from_date, { path: ['to_date'], message: "Can't be before the start date" })
  .refine((v) => !v.is_half_day || v.half !== '', { path: ['half'], message: 'Choose first or second half' })
type Values = z.infer<typeof schema>

const INTERN = 'intern' // placeholder value for the hidden type field
const dayCount = (n: number | string, word = 'day') => `${num(n)} ${Number(n) === 1 ? word : `${word}s`}`
const fmt = (iso: string) => format(parseISODate(iso), 'EEE, d MMM')
const num = (n: number | string) => {
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export function ApplyLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useUser()
  const types = useLeaveTypes()
  const balances = useBalances()
  const settings = useCompanySettings()
  const apply = useApplyLeave()
  const today = todayIST()
  // Interns don't pick a type: their request is just "Leave".
  const isIntern = me.role === 'intern'
  const empty: Values = { leave_type: isIntern ? INTERN : '', from_date: today, to_date: today, is_half_day: false, half: '', reason: '', cc: [] }
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty })
  const { register, control, handleSubmit, formState, reset, watch, setValue } = form
  const v = watch()

  useEffect(() => {
    if (open) reset(empty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset])

  const activeTypes = types.data?.filter((t) => t.is_active) ?? []
  const selectedType = activeTypes.find((t) => String(t.id) === v.leave_type)
  const availableFor = (id: number) => balances.data?.find((b) => b.leave_type.id === id)?.available

  // Half-day: single date; type must allow it.
  useEffect(() => {
    if (v.is_half_day && v.to_date !== v.from_date) setValue('to_date', v.from_date)
  }, [v.is_half_day, v.from_date, v.to_date, setValue])
  useEffect(() => {
    if (selectedType && !selectedType.allow_half_day && v.is_half_day) setValue('is_half_day', false)
  }, [selectedType, v.is_half_day, setValue])
  useEffect(() => {
    if (v.to_date < v.from_date) setValue('to_date', v.from_date)
  }, [v.from_date, v.to_date, setValue])

  const previewInput = useMemo<PreviewInput | null>(
    () =>
      open && v.leave_type && v.from_date && v.to_date && v.to_date >= v.from_date
        ? { leave_type: isIntern ? undefined : Number(v.leave_type), from_date: v.from_date, to_date: v.to_date, is_half_day: v.is_half_day, half: v.is_half_day ? v.half : '' }
        : null,
    [open, isIntern, v.leave_type, v.from_date, v.to_date, v.is_half_day, v.half],
  )
  const debounced = useDebounce(previewInput, 250)
  const preview = useLeavePreview(debounced)
  const p = preview.data
  const issues = (p?.issues ?? []).filter((i) => i.code !== 'half_required')
  const offDays = p?.breakdown.filter((d) => d.kind !== 'working') ?? []

  const defaultCc = (settings.data?.default_cc_users ?? []).filter((u) => u.id !== me.id && u.id !== me.manager?.id)

  const onSubmit = handleSubmit((values) =>
    apply.mutate(
      {
        leave_type: isIntern ? undefined : Number(values.leave_type),
        from_date: values.from_date,
        to_date: values.to_date,
        is_half_day: values.is_half_day,
        half: values.is_half_day ? values.half : '',
        reason: values.reason,
        cc_ids: values.cc.map((u) => u.id),
      },
      {
        onSuccess: (r) => {
          toast.success(`${r.leave_type.name} applied · ${dayCount(r.days)}`, {
            description: r.approver ? `Waiting for ${r.approver.name}'s approval.` : 'Waiting for admin approval.',
          })
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
      title="Apply for leave"
      description={me.manager ? `Your request goes to ${me.manager.name} for approval.` : 'Your request goes to your admins for approval.'}
      className="md:max-w-xl"
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={apply.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={apply.isPending} disabled={issues.length > 0}>
            Apply{p && p.days > 0 ? ` · ${dayCount(p.days)}` : ''}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!isIntern && (
          <Controller
            control={control}
            name="leave_type"
            render={({ field }) => (
              <FormField label="Leave type" error={formState.errors.leave_type?.message}>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Leave type">
                    <SelectValue placeholder="Choose a leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTypes.map((t) => {
                      const avail = availableFor(t.id)
                      return (
                        <SelectItem key={t.id} value={String(t.id)}>
                          <span className="flex items-center gap-2">
                            <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                            {t.name}
                            <span className="text-muted-foreground">
                              {t.is_paid ? (avail != null ? `· ${num(avail)} left` : '') : '· unpaid'}
                            </span>
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="From" error={formState.errors.from_date?.message}>
            <Input type="date" {...register('from_date')} />
          </FormField>
          <FormField label="To" error={formState.errors.to_date?.message}>
            <Input type="date" min={v.from_date} disabled={v.is_half_day} {...register('to_date')} />
          </FormField>
        </div>

        <div className="rounded-xl border border-border p-3">
          <Controller
            control={control}
            name="is_half_day"
            render={({ field }) => (
              <label className={cn('flex items-center justify-between gap-4', selectedType && !selectedType.allow_half_day ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
                <span>
                  <span className="block text-sm font-medium">Half day</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {selectedType && !selectedType.allow_half_day ? `${selectedType.name} is full days only` : 'Take only the first or second half'}
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!!selectedType && !selectedType.allow_half_day} />
              </label>
            )}
          />
          {v.is_half_day && (
            <Controller
              control={control}
              name="half"
              render={({ field }) => (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Session">
                    {(['first', 'second'] as const).map((h) => (
                      <button
                        key={h}
                        type="button"
                        role="radio"
                        aria-checked={field.value === h}
                        onClick={() => field.onChange(h)}
                        className={cn(
                          'h-11 rounded-lg border text-sm font-medium transition-colors md:h-10',
                          field.value === h ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-border hover:bg-muted/60',
                        )}
                      >
                        {h === 'first' ? 'First half' : 'Second half'}
                      </button>
                    ))}
                  </div>
                  {formState.errors.half && <p className="mt-1.5 text-[13px] text-destructive">{formState.errors.half.message}</p>}
                </div>
              )}
            />
          )}
        </div>

        {/* Live preview */}
        {previewInput && (
          <div className="rounded-xl bg-muted/60 p-3.5" aria-live="polite">
            {!p ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Calculating…
              </p>
            ) : (
              <div className={cn('space-y-2.5 transition-opacity', preview.isFetching && 'opacity-60')}>
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CalendarRange className="size-4 text-primary" aria-hidden />
                    {dayCount(p.days, 'working day')}
                  </p>
                  {p.balance && p.balance.is_paid && (
                    <p className="tabular text-[13px] text-muted-foreground">
                      Balance {num(p.balance.available)} →{' '}
                      <span className={cn('font-semibold', p.balance.after < 0 ? 'text-destructive' : 'text-foreground')}>{num(p.balance.after)}</span>
                    </p>
                  )}
                </div>
                {offDays.length > 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    Not counted:{' '}
                    {offDays
                      .slice(0, 4)
                      .map((d) => `${fmt(d.date)} (${d.kind === 'holiday' ? d.name : 'weekly off'})`)
                      .join(', ')}
                    {offDays.length > 4 ? ` +${offDays.length - 4} more` : ''}
                  </p>
                )}
                {issues.map((i) => (
                  <p key={i.code} className="flex items-start gap-2 text-[13px] font-medium text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {i.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <FormField label="Reason" error={formState.errors.reason?.message}>
          <Textarea rows={3} maxLength={1000} placeholder="e.g. Family function in Chennai" {...register('reason')} />
        </FormField>

        <Controller
          control={control}
          name="cc"
          render={({ field }) => (
            <FormField
              label="CC (optional)"
              hint={defaultCc.length ? `Always notified: ${defaultCc.map((u) => u.name).join(', ')}` : 'They can view the request but not approve it.'}
            >
              <UserPicker multiple value={field.value} onChange={field.onChange} excludeIds={[me.id]} placeholder="Add people to keep in the loop" />
            </FormField>
          )}
        />
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
