import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { UserPicker, type PickedUser } from '@/components/UserPicker'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { CompanySettings } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCompanySettings, useUpdateCompanySettings } from './api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Enter a time')

const schema = z
  .object({
    office_start: time,
    office_end: time,
    late_after: time,
    half_day_hours: z.coerce.number<number>().min(0.5, 'At least 0.5 hours').max(24),
    weekly_offs: z.array(z.number()).max(6, 'At least one working day is required'),
    work_summary_required: z.boolean(),
    attendance_start: z.string(),
    default_cc: z.array(z.custom<PickedUser>()),
    backup_approver: z.custom<PickedUser | null>(),
  })
  .refine((v) => v.office_end > v.office_start, { path: ['office_end'], message: 'Must be after office start' })
  .refine((v) => v.late_after >= v.office_start && v.late_after < v.office_end, {
    path: ['late_after'],
    message: 'Must be within office hours',
  })
type Values = z.infer<typeof schema>

const toValues = (s: CompanySettings): Values => ({
  office_start: s.office_start,
  office_end: s.office_end,
  late_after: s.late_after,
  half_day_hours: Number(s.half_day_hours),
  weekly_offs: s.weekly_offs,
  work_summary_required: s.work_summary_required,
  attendance_start: s.attendance_start ?? '',
  default_cc: s.default_cc_users.map((u) => ({ id: u.id, name: u.name, email: u.email, designation: u.designation })),
  backup_approver: s.backup_approver_user
    ? { id: s.backup_approver_user.id, name: s.backup_approver_user.name, email: s.backup_approver_user.email, designation: s.backup_approver_user.designation }
    : null,
})

export function WorkRulesTab() {
  const settings = useCompanySettings()
  if (settings.isPending) {
    return (
      <SkeletonGroup className="space-y-4">
        {[3, 1, 1].map((n, i) => (
          <Card key={i} className="space-y-4 p-6">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: n }).map((_, j) => (
                <Skeleton key={j} className="h-10 rounded-lg" />
              ))}
            </div>
          </Card>
        ))}
      </SkeletonGroup>
    )
  }
  if (settings.isError) return <Card><ErrorState error={settings.error} onRetry={() => settings.refetch()} /></Card>
  return <WorkRulesForm settings={settings.data} />
}

function WorkRulesForm({ settings }: { settings: CompanySettings }) {
  const save = useUpdateCompanySettings()
  const values = useMemo(() => toValues(settings), [settings])
  const form = useForm<Values>({ resolver: zodResolver(schema), values })
  const { register, control, handleSubmit, formState } = form

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      {
        ...v,
        half_day_hours: String(v.half_day_hours),
        attendance_start: v.attendance_start || null,
        default_cc: v.default_cc.map((u) => u.id),
        backup_approver: v.backup_approver?.id ?? null,
      },
      {
        onSuccess: () => toast.success('Work rules saved'),
        onError: (err) => {
          if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
        },
      },
    ),
  )

  return (
    <form onSubmit={onSubmit} className="space-y-4 lg:space-y-6" noValidate>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Office timings</CardTitle>
            <CardDescription>Used to mark Late and Half-day automatically. All times are IST.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Office starts" error={formState.errors.office_start?.message}>
            <Input type="time" {...register('office_start')} />
          </FormField>
          <FormField label="Office ends" error={formState.errors.office_end?.message}>
            <Input type="time" {...register('office_end')} />
          </FormField>
          <FormField label="Late after" error={formState.errors.late_after?.message} hint="Check-ins after this are Late.">
            <Input type="time" {...register('late_after')} />
          </FormField>
          <FormField label="Full-day minimum (hours)" error={formState.errors.half_day_hours?.message} hint="Less than this is a Half-day.">
            <Input type="number" step="0.25" min="0.5" max="24" inputMode="decimal" {...register('half_day_hours')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Weekly offs</CardTitle>
            <CardDescription>Check-ins are blocked on these days and they’re excluded from leave counts.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="weekly_offs"
            render={({ field }) => (
              <div role="group" aria-label="Weekly off days" className="grid grid-cols-7 gap-2 sm:flex sm:flex-wrap">
                {DAYS.map((d, i) => {
                  const on = field.value.includes(i)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== i) : [...field.value, i].sort())}
                      className={cn(
                        'h-11 rounded-lg border text-sm font-medium transition-colors sm:w-16',
                        on
                          ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            )}
          />
          {formState.errors.weekly_offs && (
            <p role="alert" className="mt-2 text-[13px] text-destructive">
              {formState.errors.weekly_offs.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Attendance tracking start</CardTitle>
            <CardDescription>
              The day your team started using HRMS. Earlier days are left blank instead of being marked Absent. Joining dates
              are not changed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField
            label="Track attendance from"
            error={formState.errors.attendance_start?.message}
            hint="Leave empty to count from each person's joining date."
          >
            <Input type="date" {...register('attendance_start')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Daily work summary</CardTitle>
            <CardDescription>
              Employees write what they worked on each day. Managers and admins see it in Attendance and in the daily report.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="work_summary_required"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3">
                <span>
                  <span className="block text-sm font-medium">Require a summary at check-out</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {field.value
                      ? "Employees can't check out until they write a few lines about their day."
                      : 'Optional: employees are asked at check-out but can skip it.'}
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Require a work summary at check-out" />
              </label>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Default CC on leave requests</CardTitle>
            <CardDescription>These people are informed of every leave request (e.g. HR). They can view but not approve.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="default_cc"
            render={({ field }) => (
              <UserPicker multiple value={field.value} onChange={field.onChange} placeholder="Add people to always CC" />
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Backup approver</CardTitle>
            <CardDescription>
              When someone's reporting manager is on leave, their new leave and attendance requests go to this admin instead.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Controller
            control={control}
            name="backup_approver"
            render={({ field }) => (
              <UserPicker value={field.value} onChange={field.onChange} roles={['admin']} placeholder="Choose an admin (optional)" />
            )}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
        <Button type="submit" size="lg" loading={save.isPending} disabled={!formState.isDirty} className="shadow-md max-sm:w-full">
          Save work rules
        </Button>
      </div>
    </form>
  )
}
