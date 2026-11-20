import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Building2, CalendarDays, Camera, IdCard, Mail, Trash2, UserRound } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ThemeSegmented } from '@/app/layout/ThemeToggle'
import { fmtDate, todayIST } from '@/lib/date'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { IMAGE_ACCEPT, MAX_UPLOAD_MB, prepareImage } from '@/lib/upload'
import { authApi, meQueryKey } from './api'
import { useAuth, useUser } from './AuthProvider'
import { InternshipCard } from '@/features/employees/Internship'
import { PasswordInput } from './PasswordInput'
import { changePasswordSchema, type ChangePasswordValues } from './schemas'

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(150),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s()-]*$/, 'Enter a valid phone number'),
  date_of_birth: z.string(),
})
type ProfileValues = z.infer<typeof profileSchema>

export default function ProfilePage() {
  const user = useUser()
  return (
    <>
      <PageHeader title="My profile" description="Your personal details and account security." />
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center text-center">
            <ProfilePhoto />
            <h2 className="mt-4 text-lg font-semibold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.designation || 'No designation set'}</p>
            <StatusBadge status={user.role} dot={false} className="mt-2" />
            <dl className="mt-6 w-full space-y-3 text-left text-sm">
              <InfoRow icon={<IdCard />} label="Employee ID" value={user.employee_code || '—'} />
              <InfoRow icon={<Mail />} label="Email" value={user.email} />
              <InfoRow icon={<Building2 />} label="Company" value={user.company.name} />
              <InfoRow icon={<UserRound />} label="Reports to" value={user.manager?.name ?? '—'} />
              <InfoRow icon={<Briefcase />} label="Designation" value={user.designation || '—'} />
              <InfoRow icon={<CalendarDays />} label="Joined" value={user.joining_date ? fmtDate(user.joining_date) : '—'} />
            </dl>
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          <ProfileForm />
          {user.internship && <InternshipCard internship={user.internship} title="Your internship" />}
          <PasswordForm />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Choose how HRMS looks on this device.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ThemeSegmented className="max-w-sm" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="flex w-[8.75rem] shrink-0 items-center gap-3 text-muted-foreground">
        <span className="[&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  )
}

function ProfileForm() {
  const user = useUser()
  const qc = useQueryClient()
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { name: user.name, phone: user.phone, date_of_birth: user.date_of_birth ?? '' },
  })
  const save = useMutation({
    mutationFn: authApi.updateMe,
    onSuccess: (me) => {
      qc.setQueryData(meQueryKey, me)
      toast.success('Profile updated')
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
    },
  })

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Your email, role and manager are managed by your admin.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate({ ...v, date_of_birth: v.date_of_birth || null }))}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <FormField label="Full name" error={form.formState.errors.name?.message}>
            <Input autoComplete="name" {...form.register('name')} />
          </FormField>
          <FormField label="Phone" hint="Optional." error={form.formState.errors.phone?.message}>
            <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" {...form.register('phone')} />
          </FormField>
          <FormField
            label="Date of birth"
            error={form.formState.errors.date_of_birth?.message}
            hint="Colleagues only ever see the day and month, never the year."
          >
            <Input type="date" autoComplete="bday" max={todayIST()} {...form.register('date_of_birth')} />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordForm() {
  const { establishSession } = useAuth()
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })
  const change = useMutation({
    mutationFn: (v: ChangePasswordValues) =>
      authApi.changePassword({ current_password: v.current_password, new_password: v.new_password }),
    onSuccess: (res) => {
      establishSession(res) // other sessions are revoked; this one gets fresh tokens
      form.reset()
      toast.success('Password changed. Other devices have been signed out.')
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
    },
  })

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Changing your password signs you out on all other devices.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((v) => change.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label="Current password" error={form.formState.errors.current_password?.message} className="sm:col-span-2">
            <PasswordInput autoComplete="current-password" {...form.register('current_password')} />
          </FormField>
          <FormField label="New password" error={form.formState.errors.new_password?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('new_password')} />
          </FormField>
          <FormField label="Confirm new password" error={form.formState.errors.confirm?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" loading={change.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** Your own profile photo: shown next to your name everywhere (lists, requests, news, the header). */
function ProfilePhoto() {
  const user = useUser()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const onDone = (me: Awaited<ReturnType<typeof authApi.uploadAvatar>>) => {
    qc.setQueryData(meQueryKey, me)
    qc.invalidateQueries({ queryKey: ['employees'] })
  }
  const upload = useMutation({ mutationFn: authApi.uploadAvatar, onSuccess: onDone })
  const remove = useMutation({ mutationFn: authApi.removeAvatar, onSuccess: onDone })

  const onPick = async (file?: File) => {
    if (!file) return
    const r = await prepareImage(file, 'Your photo', 1200)
    if ('error' in r) return toast.error(r.error)
    upload.mutate(r.file, {
      onSuccess: () => toast.success('Profile photo updated'),
      onError: (err) => toast.error(getErrorMessage(err)),
    })
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={upload.isPending}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={user.avatar_url ? 'Change profile photo' : 'Add a profile photo'}
      >
        <Avatar name={user.name} seed={user.id} src={user.avatar_url} size="xl" className="size-24 text-2xl" />
        <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
          <Camera className="size-4" aria-hidden />
        </span>
        {upload.isPending && <span className="absolute inset-0 animate-pulse rounded-full bg-background/60" aria-hidden />}
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void onPick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div className="mt-2 flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => input.current?.click()} loading={upload.isPending}>
          {upload.isPending ? 'Uploading…' : user.avatar_url ? 'Change photo' : 'Add photo'}
        </Button>
        {user.avatar_url && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Photo removed'), onError: (e) => toast.error(getErrorMessage(e)) })}
          >
            {!remove.isPending && <Trash2 />} Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG or WebP · max {MAX_UPLOAD_MB} MB</p>
    </div>
  )
}
