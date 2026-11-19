import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { authApi } from './api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { PasswordInput } from './PasswordInput'
import { signupSchema, type SignupValues } from './schemas'

export default function SignupPage() {
  const { establishSession } = useAuth()
  const navigate = useNavigate()
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { company_name: '', name: '', email: '', password: '' },
  })
  const { register, handleSubmit, formState, setError } = form

  const signup = useMutation({
    mutationFn: authApi.signup,
    onSuccess: (res) => {
      establishSession(res)
      toast.success(`${res.user.company.name} is ready. Let’s set things up!`)
      navigate('/', { replace: true })
    },
    onError: (err) => {
      if (!applyFieldErrors(err, setError)) toast.error(getErrorMessage(err))
    },
  })

  return (
    <AuthLayout title="Create your company" subtitle="You’ll be the admin. Invite your team once you’re in.">
      <form onSubmit={handleSubmit((v) => signup.mutate(v))} className="space-y-5" noValidate>
        <FormField label="Company name" error={formState.errors.company_name?.message}>
          <Input autoComplete="organization" placeholder="Acme Labs" autoFocus {...register('company_name')} />
        </FormField>
        <FormField label="Your full name" error={formState.errors.name?.message}>
          <Input autoComplete="name" placeholder="Priya Sharma" {...register('name')} />
        </FormField>
        <FormField label="Work email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" {...register('email')} />
        </FormField>
        <FormField label="Password" error={formState.errors.password?.message} hint="At least 8 characters. Avoid common passwords.">
          <PasswordInput autoComplete="new-password" placeholder="Create a password" {...register('password')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={signup.isPending}>
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
