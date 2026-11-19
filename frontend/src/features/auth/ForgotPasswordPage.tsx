import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/errors'
import { authApi } from './api'
import { AuthLayout } from './AuthLayout'
import { forgotSchema, type ForgotValues } from './schemas'

export default function ForgotPasswordPage() {
  const form = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })
  const forgot = useMutation({
    mutationFn: (v: ForgotValues) => authApi.forgotPassword(v.email),
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (forgot.isSuccess) {
    return (
      <AuthLayout title="Check your inbox">
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-xs">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success-soft-foreground">
            <MailCheck className="size-6" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{forgot.variables.email}</span>, we’ve sent a
            link to reset your password. It expires in 3 days.
          </p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => forgot.reset()}>
            Use a different email
          </Button>
        </div>
        <BackToLogin />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot password?" subtitle="Enter your email and we’ll send you a reset link.">
      <form onSubmit={form.handleSubmit((v) => forgot.mutate(v))} className="space-y-5" noValidate>
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" autoFocus {...form.register('email')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={forgot.isPending}>
          Send reset link
        </Button>
      </form>
      <BackToLogin />
    </AuthLayout>
  )
}

function BackToLogin() {
  return (
    <Link
      to="/login"
      className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Back to sign in
    </Link>
  )
}
