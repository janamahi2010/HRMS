import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  disabled?: boolean
  className?: string
}

export function Tooltip({ content, children, side = 'top', disabled, className }: TooltipProps) {
  if (disabled) return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md origin-[var(--radix-tooltip-content-transform-origin)] data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-fade-out',
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
