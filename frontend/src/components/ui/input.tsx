import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { useFieldWiring } from './form-field'

const fieldBase =
  'w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, type = 'text', ...props }, ref) => {
  const wiring = useFieldWiring(props as Parameters<typeof useFieldWiring>[0])
  return <input ref={ref} type={type} className={cn(fieldBase, 'h-11 md:h-10', className)} {...props} {...wiring} />
})
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  const wiring = useFieldWiring(props as Parameters<typeof useFieldWiring>[0])
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-[88px] py-2.5 resize-y', className)} {...props} {...wiring} />
})
Textarea.displayName = 'Textarea'
