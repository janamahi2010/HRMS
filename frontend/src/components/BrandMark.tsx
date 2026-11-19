import { cn } from '@/lib/utils'

interface BrandMarkProps {
  name?: string
  logoUrl?: string | null
  className?: string
  showName?: boolean
}

/** Company logo (or an indigo monogram) with optional name. */
export function BrandMark({ name = 'HRMS', logoUrl, className, showName = true }: BrandMarkProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" width={32} height={32} />
      ) : (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-xs">
          {name.trim()[0]?.toUpperCase() ?? 'H'}
        </div>
      )}
      {showName && <span className="truncate text-[15px] font-semibold tracking-tight">{name}</span>}
    </div>
  )
}
