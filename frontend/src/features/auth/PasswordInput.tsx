import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/input'

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { defaultShow?: boolean }>(
  ({ defaultShow = false, ...props }, ref) => {
    const [show, setShow] = useState(defaultShow)
    return (
      <div className="relative">
        <Input ref={ref} type={show ? 'text' : 'password'} className="pr-11" {...props} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
