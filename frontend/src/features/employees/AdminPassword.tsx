import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { getApiError, getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useSetEmployeePassword } from './api'

/** Plain password box for an admin-chosen password. */
export function AdminPasswordInput({
  value,
  onChange,
  error,
  label = 'Password',
}: {
  value: string
  onChange: (v: string) => void
  error?: string
  label?: string
}) {
  return (
    <FormField label={label} error={error} hint="At least 8 characters; avoid common or easily guessed passwords.">
      <PasswordInput autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  )
}

export function MustChangeCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">Ask them to change it at first sign-in</span>
        <span className="block text-[13px] text-muted-foreground">Recommended, so only they know their final password.</span>
      </span>
    </label>
  )
}

/** Card-style radio options shared by the create form and the Set password dialog. */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly (readonly [T, string, string])[]
  label: string
}) {
  return (
    <div className={cn('grid gap-2', options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')} role="radiogroup" aria-label={label}>
      {options.map(([v, title, hint]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
            value === v ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted/60',
          )}
        >
          <span className={cn('block text-sm font-medium', value === v && 'text-primary-soft-foreground')}>{title}</span>
          <span className="block text-[13px] text-muted-foreground">{hint}</span>
        </button>
      ))}
    </div>
  )
}

/** Admin: reset someone's password (to their email address by default) when email isn't set up or they forgot it. */
export function SetPasswordDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employee: { id: number; name: string; email: string } | null
}) {
  const setPw = useSetEmployeePassword()
  const [mode, setMode] = useState<'email' | 'custom'>('email')
  const [password, setPassword] = useState('')
  const [mustChange, setMustChange] = useState(true)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (open) {
      setMode('email')
      setPassword('')
      setMustChange(true)
      setError(undefined)
    }
  }, [open])

  const submit = () => {
    if (!employee) return
    if (mode === 'custom' && password.length < 8) return setError('At least 8 characters.')
    setPw.mutate(
      mode === 'email'
        ? { id: employee.id, use_email: true }
        : { id: employee.id, password, must_change_password: mustChange },
      {
        onSuccess: () => {
          toast.success(`Password reset for ${employee.name.split(' ')[0]}`, {
            description:
              mode === 'email'
                ? `They sign in with ${employee.email} as the password and must change it right away.`
                : 'They were signed out everywhere. Share the new password with them securely.',
          })
          onOpenChange(false)
        },
        onError: (err) => {
          const msg = getApiError(err)?.fields?.password
          if (Array.isArray(msg) && msg[0]) setError(String(msg[0]))
          else toast.error(getErrorMessage(err))
        },
      },
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? `Reset password for ${employee.name}` : 'Reset password'}
      description="This signs them out on every device."
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={setPw.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={submit} loading={setPw.isPending}>
            {!setPw.isPending && <KeyRound />} Reset password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ChoiceCards
          label="New password"
          value={mode}
          onChange={setMode}
          options={[
            ['email', 'Their email address', employee ? employee.email : 'They must change it at sign-in'],
            ['custom', 'Choose a password', 'Type one and share it with them'],
          ]}
        />
        {mode === 'email' ? (
          <p className="rounded-xl bg-muted/60 p-3 text-[13px] text-muted-foreground">
            They sign in with their email address as both username and password, then must choose a new password before using the app.
          </p>
        ) : (
          <>
            <AdminPasswordInput value={password} onChange={(v) => (setPassword(v), setError(undefined))} error={error} label="New password" />
            <MustChangeCheckbox checked={mustChange} onChange={setMustChange} />
          </>
        )}
      </div>
    </ResponsiveDialog>
  )
}
