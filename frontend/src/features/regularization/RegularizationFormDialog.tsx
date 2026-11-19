import { zodResolver } from '@hookform/resolvers/zod'
import { Briefcase, Fingerprint, House, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { format, subDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { useCalendar } from '@/features/attendance/api'
import { useCompanySettings } from '@/features/settings/api'
import { fmtTime, parseISODate, todayIST, TZ } from '@/lib/date'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { RegularizationType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCreateRegularization } from './api'

export const REG_TYPES: { value: RegularizationType; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'missed_punch', label: 'Missed punch', hint: 'Forgot to check in or out', icon: Fingerprint },
  { value: 'wfh', label: 'Work from home', hint: 'Worked remotely', icon: House },
  { value: 'client_visit', label: 'Client visit', hint: 'Worked at a client site', icon: Briefcase },
]

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/
const schema = z
  .object({
    type: z.enum(['missed_punch', 'wfh', 'client_visit']),
    date: z.string().min(1, 'Pick a date'),
    check_in_time: z.string().regex(hhmm, 'Enter a time'),
    check_out_time: z.string().regex(hhmm, 'Enter a time'),
    reason: z.string().trim().min(5, 'Tell your approver what happened (5+ characters)').max(1000),
  })
  .refine((v) => v.check_out_time > v.check_in_time, { path: ['check_out_time'], message: 'Must be after check-in' })
type Values = z.infer<typeof schema>

export function RegularizationFormDialog({
  open,
  onOpenChange,
  initialDate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialDate?: string | null
}) {
  const today = todayIST()
  const minDate = format(subDays(parseISODate(today), 30), 'yyyy-MM-dd')
  const settings = useCompanySettings()
  const create = useCreateRegularization()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'missed_punch', date: initialDate ?? '', check_in_time: '', check_out_time: '', reason: '' },
  })
  const { register, control, handleSubmit, formState, reset, watch, setValue } = form
  const date = watch('date')
  const type = watch('type')

  // Look up the chosen day (cached month query) to show its status and prefill punches.
  const d = date ? parseISODate(date) : parseISODate(today)
  const cal = useCalendar(d.getFullYear(), d.getMonth() + 1)
  const day = useMemo(() => cal.data?.days.find((x) => x.date === date), [cal.data, date])
  // A day with both punches can't be regularized (the server enforces this too).
  const complete = !!day?.record?.check_in_at && !!day.record.check_out_at
  const offDay = day?.day_kind === 'holiday' || day?.day_kind === 'weekly_off' || day?.status === 'on_leave'

  useEffect(() => {
    if (open) reset({ type: 'missed_punch', date: initialDate ?? '', check_in_time: '', check_out_time: '', reason: '' })
  }, [open, initialDate, reset])

  useEffect(() => {
    if (!open) return
    const s = settings.data
    const rec = day?.record
    const inT = rec?.check_in_at ? formatInTimeZone(rec.check_in_at, TZ, 'HH:mm') : s?.office_start
    const outT = rec?.check_out_at ? formatInTimeZone(rec.check_out_at, TZ, 'HH:mm') : s?.office_end
    if (inT && !formState.dirtyFields.check_in_time) setValue('check_in_time', inT)
    if (outT && !formState.dirtyFields.check_out_time) setValue('check_out_time', outT)
  }, [open, day, settings.data, setValue, formState.dirtyFields.check_in_time, formState.dirtyFields.check_out_time])

  const onSubmit = handleSubmit((v) =>
    create.mutate(v, {
      onSuccess: (r) => {
        toast.success('Request submitted', {
          description: r.approver ? `Sent to ${r.approver.name} for approval.` : 'Sent to your admins for approval.',
        })
        onOpenChange(false)
      },
      onError: (err) => {
        if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
      },
    }),
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request regularization"
      description="Fix a missed punch or record work done away from the office."
      className="md:max-w-lg"
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={create.isPending} disabled={complete || offDay}>
            Submit request
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Type</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {REG_TYPES.map((t) => {
                  const active = field.value === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => field.onChange(t.value)}
                      className={cn(
                        'flex min-h-11 flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                        active ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-border hover:bg-muted/60',
                      )}
                    >
                      <t.icon className="size-5" aria-hidden />
                      <span className="text-[13px] font-medium leading-tight">{t.label}</span>
                      <span className="hidden text-[11px] leading-tight opacity-75 sm:block">{t.hint}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
        />

        <FormField
          label="Date"
          error={
            formState.errors.date?.message ??
            (complete
              ? 'This day already has both check-in and check-out. Nothing to regularize.'
              : offDay
                ? `This is a ${day?.status === 'on_leave' ? 'leave day' : day?.day_kind === 'holiday' ? 'holiday' : 'weekly off'}; pick a working day.`
                : undefined)
          }
          hint={
            day?.status ? (
              <span className="inline-flex items-center gap-2">
                Currently <StatusBadge status={day.status} />
                {day.record?.check_in_at && (
                  <span>
                    {fmtTime(day.record.check_in_at)}
                    {day.record.check_out_at ? ` – ${fmtTime(day.record.check_out_at)}` : ', no check-out'}
                  </span>
                )}
              </span>
            ) : (
              'Within the last 30 days, working days only.'
            )
          }
        >
          <Input type="date" min={minDate} max={today} {...register('date')} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Check in" error={formState.errors.check_in_time?.message}>
            <Input type="time" {...register('check_in_time')} />
          </FormField>
          <FormField label="Check out" error={formState.errors.check_out_time?.message}>
            <Input type="time" {...register('check_out_time')} />
          </FormField>
        </div>

        <FormField label="Reason" error={formState.errors.reason?.message}>
          <Textarea
            rows={3}
            maxLength={1000}
            placeholder={
              type === 'client_visit' ? 'Client name and location' : 'What happened? e.g. forgot to check out after the release call'
            }
            {...register('reason')}
          />
        </FormField>
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
