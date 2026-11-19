import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from './ui/card'
import { Skeleton } from './ui/skeleton'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
  neutral: 'bg-neutral-soft text-neutral-soft-foreground',
}

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  tone?: Tone
  hint?: ReactNode
  className?: string
  onClick?: () => void
}

export function StatCard({ label, value, icon: Icon, tone = 'primary', hint, className, onClick }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Card className={cn('p-4 sm:p-5', onClick && 'transition-shadow hover:shadow-md', className)}>
      <Comp onClick={onClick} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="tabular mt-1.5 whitespace-nowrap text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', toneClasses[tone])}>
            <Icon className="size-5" aria-hidden />
          </div>
        )}
      </Comp>
    </Card>
  )
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
        <Skeleton className="size-10 rounded-xl" />
      </div>
    </Card>
  )
}
