import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/errors'
import { authApi } from './api'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { PasswordInput } from './PasswordInput'

interface LoginValues {
  email: string
  password: string
}

// Same rules as before, as built-in react-hook-form rules: the login page is the first thing
// everyone loads, so it shouldn't download the zod validation library (~37 KB) for two checks.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const rules = {
  email: {
    setValueAs: (v: string) => v.trim(),
    required: 'Email is required',
    pattern: { value: EMAIL, message: 'Enter a valid email' },
  },
  password: { required: 'Password is required' },
} as const

export default function LoginPage() {
  const { establishSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const requested = (location.state as { from?: string } | null)?.from
  // Only ever redirect within the app (a same-origin path), never to another site.
  const from = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  const form = useForm<LoginValues>({ defaultValues: { email: '', password: '' } })
  const { register, handleSubmit, formState } = form

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      establishSession(res)
      toast.success(`Welcome back, ${res.user.name.split(' ')[0]}!`)
      navigate(from, { replace: true })
    },
    onError: (err) => {
      const message = getErrorMessage(err)
      form.setError('password', { type: 'server', message })
    },
  })

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back! Enter your details to continue.">
      <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-5" noValidate>
        <FormField label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" autoFocus {...register('email', rules.email)} />
        </FormField>
        <FormField
          label="Password"
          error={formState.errors.password?.message}
          aside={
            <Link to="/forgot-password" className="text-[13px] font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" placeholder="••••••••" {...register('password', rules.password)} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
      {import.meta.env.DEV && (
        // Dev-only shortcut for the `seed_demo` accounts; stripped from production builds.
        <div className="mt-6 rounded-xl border border-dashed border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Demo accounts (dev only)</p>
          <div className="flex flex-wrap gap-2">
            {(['admin', 'priya', 'ananya'] as const).map((who) => (
              <Button
                key={who}
                type="button"
                variant="secondary"
                size="sm"
                disabled={login.isPending}
                onClick={() => login.mutate({ email: `${who}@demo.hrms`, password: 'Demo@12345' })}
              >
                {who === 'admin' ? 'Admin' : who === 'priya' ? 'Manager' : 'Employee'}
              </Button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to HRMS?{' '}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          Create a company account
        </Link>
      </p>
    </AuthLayout>
  )
}
