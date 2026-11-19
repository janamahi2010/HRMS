import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { authApi } from './api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { PasswordInput } from './PasswordInput'
import { changePasswordSchema, type ChangePasswordValues } from './schemas'

/**
 * Shown right after signing in with a password an admin set (e.g. their email address).
 * Nothing else in the app is reachable until they choose their own password.
 */
export default function ChangePasswordRequiredPage() {
  const { user, establishSession, logout } = useAuth()
  const navigate = useNavigate()
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(
      changePasswordSchema.refine((v) => v.new_password !== v.current_password, {
        path: ['new_password'],
        message: 'Choose a password different from the one you were given',
      }),
    ),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })
  const change = useMutation({
    mutationFn: (v: ChangePasswordValues) => authApi.changePassword({ current_password: v.current_password, new_password: v.new_password }),
    onSuccess: (res) => {
      establishSession(res)
      toast.success('Password updated. Welcome aboard!')
      navigate('/', { replace: true })
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
    },
  })

  if (user && !user.must_change_password) return <Navigate to="/" replace />

  return (
    <AuthLayout
      title="Choose your new password"
      subtitle={
        <>
          Your admin set a temporary password for <span className="font-medium text-foreground">{user?.email}</span>. Pick your own to
          continue.
        </>
      }
    >
      <form onSubmit={form.handleSubmit((v) => change.mutate(v))} className="space-y-5" noValidate>
        <FormField
          label="Temporary password"
          error={form.formState.errors.current_password?.message}
          hint="The one you just signed in with (often your work email address)."
        >
          <PasswordInput autoComplete="current-password" autoFocus {...form.register('current_password')} />
        </FormField>
        <FormField label="New password" error={form.formState.errors.new_password?.message} hint="At least 8 characters. Not your email or name.">
          <PasswordInput autoComplete="new-password" {...form.register('new_password')} />
        </FormField>
        <FormField label="Confirm new password" error={form.formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={change.isPending}>
          Save and continue
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Not you?{' '}
        <button type="button" onClick={logout} className="font-medium text-primary hover:underline">
          Sign out
        </button>
      </p>
    </AuthLayout>
  )
}
