import { cloneElement, createContext, isValidElement, useContext, useId, useMemo, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

interface FormFieldProps {
  label: ReactNode
  error?: string
  hint?: ReactNode
  /** Right-aligned element on the label row (e.g. "Forgot password?" link) */
  aside?: ReactNode
  className?: string
  children: ReactElement<Record<string, unknown>>
}

export interface FieldWiring {
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Set by FormField; read by Input/Textarea/Select/UserPicker so the wiring survives wrappers like <Controller>. */
export const FieldContext = createContext<FieldWiring>({})

/** Merge explicit props with the enclosing FormField's wiring (explicit props win). */
export function useFieldWiring(props: FieldWiring): FieldWiring {
  const ctx = useContext(FieldContext)
  return {
    id: props.id ?? ctx.id,
    'aria-invalid': props['aria-invalid'] ?? ctx['aria-invalid'],
    'aria-describedby': props['aria-describedby'] ?? ctx['aria-describedby'],
  }
}

/** Label + control + error/hint with correct aria wiring. */
export function FormField({ label, error, hint, aside, className, children }: FormFieldProps) {
  const id = useId()
  const descId = `${id}-desc`
  const wiring = useMemo<FieldWiring>(
    () => ({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? descId : undefined }),
    [id, error, hint, descId],
  )
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? descId : undefined,
      })
    : children
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <FieldContext.Provider value={wiring}>{control}</FieldContext.Provider>
      {error ? (
        <p id={descId} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
