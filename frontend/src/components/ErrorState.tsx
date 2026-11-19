import { AlertTriangle, RotateCw } from 'lucide-react'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

interface ErrorStateProps {
  error?: unknown
  title?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
  compact?: boolean
}

export function ErrorState({ error, title = "We couldn't load this", onRetry, retrying, className, compact }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-soft-foreground">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw />}
          Try again
        </Button>
      )}
    </div>
  )
}
