import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuGroup = DropdownPrimitive.Group
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md origin-[var(--radix-dropdown-menu-content-transform-origin)] data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

const itemBase =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground'

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(itemBase, destructive && 'text-destructive focus:text-destructive [&_svg]:text-destructive', className)}
    {...props}
  />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof DropdownPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownPrimitive.RadioItem
    ref={ref}
    className={cn(itemBase, 'data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary-soft-foreground', className)}
    {...props}
  >
    {children}
  </DropdownPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem'

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn('px-2.5 py-2 text-sm', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
