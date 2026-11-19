import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { DialogOverlay } from './dialog'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description

const sheetVariants = cva('fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-lg focus:outline-none', {
  variants: {
    side: {
      bottom:
        'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-border pb-safe will-change-transform data-[state=open]:animate-slide-up data-[state=closed]:animate-slide-down',
      left: 'inset-y-0 left-0 h-full w-72 max-w-[85vw] border-r border-border will-change-transform data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left',
      right: 'inset-y-0 right-0 h-full w-96 max-w-[92vw] border-l border-border will-change-transform data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
    },
  },
  defaultVariants: { side: 'bottom' },
})

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants> & { hideClose?: boolean }
>(({ side = 'bottom', className, children, hideClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {side === 'bottom' && (
        <div aria-hidden className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border" />
      )}
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
SheetContent.displayName = 'SheetContent'

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-3 pb-2 pr-14', className)} {...props} />
}

export function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto overscroll-contain px-5 py-3', className)} {...props} />
}

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 border-t border-border px-5 py-4', className)} {...props} />
}
