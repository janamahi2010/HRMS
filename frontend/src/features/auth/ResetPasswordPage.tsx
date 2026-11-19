import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LinkIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { authApi } from './api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { PasswordInput } from './PasswordInput'
import { resetSchema, type ResetValues } from './schemas'

/** Handles both "reset password" (forgot flow) and "set password" (invite flow). */
export default function ResetPasswordPage({ mode }: { mode: 'reset' | 'invite' }) {
  const [params] = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { establishSession } = useAuth()
  const isInvite = mode === 'invite'

  const check = useQuery({
    queryKey: ['password-token', uid, token],
    queryFn: () => authApi.validateToken(uid, token),
    enabled: !!uid && !!token,
    retry: false,
    staleTime: Infinity,
  })

  const form = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } })

  const reset = useMutation({
    mutationFn: (v: ResetValues) => authApi.resetPassword({ uid, token, password: v.password }),
    onSuccess: (res) => {
      establishSession(res)
      toast.success(isInvite ? `Welcome aboard, ${res.user.name.split(' ')[0]}!` : 'Password updated. You’re signed in.')
      navigate('/', { replace: true })
    },
    onError: (err) => {
      if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
    },
  })

  const title = isInvite ? 'Set up your account' : 'Choose a new password'

  if (!uid || !token || check.isError) {
    return (
      <AuthLayout title="Link expired">
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-xs">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-soft-foreground">
            <LinkIcon className="size-6" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            {check.isError ? getErrorMessage(check.error) : 'This link is incomplete.'}{' '}
            {isInvite ? 'Ask your admin to resend the invite, or request a reset link below.' : ''}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (check.isPending) {
    return (
      <AuthLayout title={title}>
        <SkeletonGroup label="Checking your link" className="space-y-5">
          <Skeleton className="h-4 w-3/4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
        </SkeletonGroup>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={title}
      subtitle={
        <>
          {isInvite ? `Hi ${check.data.name.split(' ')[0]}! Create a password for ` : 'Resetting the password for '}
          <span className="font-medium text-foreground">{check.data.email}</span>
        </>
      }
    >
      <form onSubmit={form.handleSubmit((v) => reset.mutate(v))} className="space-y-5" noValidate>
        {/* Hidden username helps password managers save the right account */}
        <Input type="email" autoComplete="username" value={check.data.email} readOnly hidden />
        <FormField label="New password" error={form.formState.errors.password?.message} hint="At least 8 characters.">
          <PasswordInput autoComplete="new-password" autoFocus {...form.register('password')} />
        </FormField>
        <FormField label="Confirm password" error={form.formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          {isInvite ? 'Create password & sign in' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
