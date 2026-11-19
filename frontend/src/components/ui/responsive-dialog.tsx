import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from './sheet'

interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Centered modal on desktop, bottom sheet on mobile. Same API for both. */
export function ResponsiveDialog({ open, onOpenChange, title, description, children, footer, className }: ResponsiveDialogProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="text-lg font-semibold tracking-tight">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-sm text-muted-foreground">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</SheetDescription>
            )}
          </SheetHeader>
          <SheetBody className={className}>{children}</SheetBody>
          {footer && <SheetFooter>{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogDescription>
          )}
        </DialogHeader>
        <div>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
