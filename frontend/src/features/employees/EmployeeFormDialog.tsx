import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { UserPicker, type PickedUser } from '@/components/UserPicker'
import { useLocations } from '@/features/settings/api'
import { AdminPasswordInput, ChoiceCards, MustChangeCheckbox } from './AdminPassword'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { Employee, Role } from '@/lib/types'
import { useSaveEmployee } from './api'

const schema = z.object({
  employee_code: z.string().trim().max(20).regex(/^[A-Za-z0-9_/-]*$/, 'Use letters, numbers, - _ or / only'),
  name: z.string().trim().min(2, 'Name is required').max(150),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  phone: z.string().trim().max(20).regex(/^[+\d\s()-]*$/, 'Enter a valid phone number'),
  designation: z.string().trim().max(100),
  role: z.enum(['admin', 'manager', 'employee', 'intern']),
  manager: z.custom<PickedUser | null>(),
  office_location: z.string(),
  joining_date: z.string(),
  date_of_birth: z.string(),
  internship_start: z.string(),
  internship_end: z.string(),
  remote_allowed: z.boolean(),
  send_invite: z.boolean(),
  access: z.enum(['email', 'password', 'invite']),
  password: z.string(),
  must_change_password: z.boolean(),
})
  .refine((v) => v.access !== 'password' || v.password.length >= 8, { path: ['password'], message: 'At least 8 characters' })
type Values = z.infer<typeof schema>

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'employee', label: 'Employee', hint: 'Own data only' },
  { value: 'intern', label: 'Intern', hint: 'Fixed-term, own data' },
  { value: 'manager', label: 'Manager', hint: 'Approves their team' },
  { value: 'admin', label: 'Admin', hint: 'Full access' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee | null
}

function toValues(e?: Employee | null): Values {
  return {
    employee_code: e?.employee_code ?? '',
    name: e?.name ?? '',
    email: e?.email ?? '',
    phone: e?.phone ?? '',
    designation: e?.designation ?? '',
    role: e?.role ?? 'employee',
    manager: e?.manager ? { id: e.manager.id, name: e.manager.name } : null,
    office_location: e?.office_location ? String(e.office_location.id) : 'none',
    joining_date: e?.joining_date ?? '',
    date_of_birth: e?.date_of_birth ?? '',
    internship_start: e?.internship_start ?? '',
    internship_end: e?.internship_end ?? '',
    remote_allowed: e?.remote_allowed ?? false,
    send_invite: true,
    access: e ? 'invite' : 'email',
    password: '',
    must_change_password: true,
  }
}

export function EmployeeFormDialog({ open, onOpenChange, employee }: Props) {
  const isEdit = !!employee
  const locations = useLocations()
  const save = useSaveEmployee()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(employee) })
  const { register, control, handleSubmit, formState, reset, setError } = form
  const role = form.watch('role') // intern-only fields appear/disappear with the role
  const internshipStart = form.watch('internship_start')
  const access = form.watch('access')

  useEffect(() => {
    if (open) reset(toValues(employee))
  }, [open, employee, reset])

  // Default new hires to the only office, if there's exactly one.
  useEffect(() => {
    if (open && !isEdit && locations.data?.length === 1 && form.getValues('office_location') === 'none') {
      form.setValue('office_location', String(locations.data[0]!.id))
    }
  }, [open, isEdit, locations.data, form])

  const onSubmit = handleSubmit((v) => {
    save.mutate(
      {
        id: employee?.id,
        data: {
          employee_code: v.employee_code.toUpperCase(),
          name: v.name,
          email: v.email,
          phone: v.phone,
          designation: v.designation,
          role: v.role,
          manager_id: v.manager?.id ?? null,
          office_location_id: v.office_location === 'none' ? null : Number(v.office_location),
          joining_date: v.joining_date || null,
          date_of_birth: v.date_of_birth || null,
          internship_start: v.role === 'intern' ? v.internship_start || null : null,
          internship_end: v.role === 'intern' ? v.internship_end || null : null,
          remote_allowed: v.remote_allowed,
          ...(isEdit
            ? {}
            : v.access === 'email'
              ? { use_email_as_password: true, send_invite: false }
              : v.access === 'password'
                ? { password: v.password, must_change_password: v.must_change_password, send_invite: false }
                : { send_invite: true }),
        },
      },
      {
        onSuccess: (emp) => {
          toast.success(
            isEdit
              ? `${emp.name} updated`
              : v.access === 'email'
                ? `${emp.name} added. First password is their email (${emp.email}); they'll change it at sign-in.`
                : v.access === 'password'
                  ? `${emp.name} added. They can sign in now; share the password securely.`
                  : `${emp.name} added. Invite sent to ${emp.email}`,
          )
          onOpenChange(false)
        },
        onError: (err) => {
          // Map API field names back to form field names.
          const fields = (err as { response?: { data?: { error?: { fields?: Record<string, string[]> } } } }).response?.data?.error?.fields
          if (fields?.manager_id) setError('manager', { message: fields.manager_id[0] })
          if (fields?.office_location_id) setError('office_location', { message: fields.office_location_id[0] })
          if (!applyFieldErrors(err, setError) && !fields?.manager_id && !fields?.office_location_id) toast.error(getErrorMessage(err))
        },
      },
    )
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? `Edit ${employee.name}` : 'Add employee'}
      description={isEdit ? 'Update profile, role and reporting.' : 'By default their first password is their email address.'}
      className="md:max-w-xl"
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label="Full name" error={formState.errors.name?.message}>
          <Input autoComplete="off" placeholder="Priya Sharma" {...register('name')} />
        </FormField>
        <FormField label="Work email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="off" inputMode="email" placeholder="priya@company.com" {...register('email')} />
        </FormField>
        <FormField label="Phone" hint="Optional." error={formState.errors.phone?.message}>
          <Input type="tel" inputMode="tel" placeholder="+91 98765 43210" {...register('phone')} />
        </FormField>
        <FormField label="Designation" error={formState.errors.designation?.message}>
          <Input placeholder="Software Engineer" {...register('designation')} />
        </FormField>
        <FormField label="Role" error={formState.errors.role?.message}>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Small teams report straight to the admins: Manager is only shown for someone who already has it. */}
                  {ROLE_OPTIONS.filter((r) => r.value !== 'manager' || employee?.role === 'manager').map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label} <span className="text-muted-foreground">· {r.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <FormField
          label="Employee ID"
          error={formState.errors.employee_code?.message}
          hint={isEdit ? 'Leave empty to keep the current ID.' : `Leave empty to assign the next ${role === 'intern' ? 'INT' : 'EMP'} number.`}
        >
          <Input autoComplete="off" placeholder={isEdit ? '' : 'Automatic'} className="uppercase placeholder:normal-case" {...register('employee_code')} />
        </FormField>
        {role === 'intern' && (
          <div className="grid gap-4 rounded-xl border border-dashed border-border p-3 sm:col-span-2 sm:grid-cols-2">
            <p className="text-[13px] text-muted-foreground sm:col-span-2">
              Internship period. The start defaults to the joining date; days left are shown on their profile and in the list.
            </p>
            <FormField label="Internship start" error={formState.errors.internship_start?.message}>
              <Input type="date" {...register('internship_start')} />
            </FormField>
            <FormField label="Internship end" error={formState.errors.internship_end?.message} hint="Optional. Leave empty if open-ended.">
              <Input type="date" min={internshipStart || undefined} {...register('internship_end')} />
            </FormField>
          </div>
        )}
        <FormField label="Joining date" error={formState.errors.joining_date?.message}>
          <Input type="date" {...register('joining_date')} />
        </FormField>
        <FormField label="Date of birth" error={formState.errors.date_of_birth?.message} hint="Optional. Only day and month are shown to colleagues.">
          <Input type="date" {...register('date_of_birth')} />
        </FormField>
        <FormField label="Reporting manager" error={formState.errors.manager?.message} hint="Approves their leave and requests.">
          <Controller
            control={control}
            name="manager"
            render={({ field }) => (
              <UserPicker
                value={field.value}
                onChange={field.onChange}
                roles={['admin', 'manager']}
                excludeIds={employee ? [employee.id] : []}
                placeholder="Select manager"
              />
            )}
          />
        </FormField>
        <FormField
          label="Office location"
          error={formState.errors.office_location?.message}
          hint={form.watch('remote_allowed') ? 'Optional for remote people: punches here count as office days.' : 'Check-ins are verified against this office.'}
        >
          <Controller
            control={control}
            name="office_location"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={locations.isPending}>
                <SelectTrigger>
                  <SelectValue placeholder={locations.isPending ? 'Loading…' : 'Select office'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No office assigned</SelectItem>
                  {locations.data?.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
        <Controller
          control={control}
          name="remote_allowed"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3 sm:col-span-2">
              <span>
                <span className="block text-sm font-medium">Can check in from anywhere</span>
                <span className="block text-[13px] text-muted-foreground">
                  For work from home or field work. No office radius check; their location is still recorded when they share it.
                </span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Can check in from anywhere" />
            </label>
          )}
        />
        {!isEdit && (
          <fieldset className="space-y-3 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">How will they sign in?</legend>
            <Controller
              control={control}
              name="access"
              render={({ field }) => (
                <ChoiceCards
                  label="How will they sign in?"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    ['email', 'Email as password', 'Default · they change it at first sign-in'],
                    ['password', 'Choose a password', 'Type one and share it'],
                    ['invite', 'Email an invite link', 'Needs email set up'],
                  ]}
                />
              )}
            />
            {access === 'email' ? (
              <p className="rounded-xl bg-muted/60 p-3 text-[13px] text-muted-foreground">
                They sign in with their work email as both username and password, then must choose a new password before using the app.
              </p>
            ) : access === 'password' ? (
              <>
                <Controller
                  control={control}
                  name="password"
                  render={({ field }) => (
                    <AdminPasswordInput value={field.value} onChange={field.onChange} error={formState.errors.password?.message} />
                  )}
                />
                <Controller
                  control={control}
                  name="must_change_password"
                  render={({ field }) => <MustChangeCheckbox checked={field.value} onChange={field.onChange} />}
                />
              </>
            ) : (
              <p className="rounded-xl bg-muted/60 p-3 text-[13px] text-muted-foreground">
                We'll email a secure link to set their password (valid for 3 days). Email must be set up on the server for this to arrive.
              </p>
            )}
          </fieldset>
        )}
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
