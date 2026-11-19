import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-soft text-neutral-soft-foreground',
        primary: 'bg-primary-soft text-primary-soft-foreground',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        orange: 'bg-orange-soft text-orange-soft-foreground',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
}

const dotColor: Record<string, string> = {
  neutral: 'bg-neutral',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  orange: 'bg-orange',
  outline: 'bg-muted-foreground',
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotColor[tone ?? 'neutral'])} />}
      {children}
    </span>
  )
}
