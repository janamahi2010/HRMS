import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { forwardRef, useContext, useMemo, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '@/lib/utils'
import { FieldContext, type FieldWiring } from './form-field'

/** Explicit id/aria-* on <Select> (e.g. from FormField's cloneElement) are forwarded to the trigger. */
export function Select({
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & FieldWiring) {
  const outer = useContext(FieldContext)
  const value = useMemo<FieldWiring>(
    () => ({ id: id ?? outer.id, 'aria-invalid': ariaInvalid ?? outer['aria-invalid'], 'aria-describedby': ariaDescribedBy ?? outer['aria-describedby'] }),
    [id, ariaInvalid, ariaDescribedBy, outer],
  )
  return (
    <FieldContext.Provider value={value}>
      <SelectPrimitive.Root {...props} />
    </FieldContext.Provider>
  )
}
export const SelectValue = SelectPrimitive.Value
export const SelectGroup = SelectPrimitive.Group

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const field = useContext(FieldContext)
  return (
  <SelectPrimitive.Trigger
    ref={ref}
    id={field.id}
    aria-invalid={field['aria-invalid']}
    aria-describedby={field['aria-describedby']}
    className={cn(
      'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-muted-foreground aria-[invalid=true]:border-destructive md:h-10 [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={4}
      className={cn(
        'relative z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md origin-[var(--radix-select-content-transform-origin)] data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
        position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = 'SelectContent'

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-10 w-full cursor-pointer select-none items-center rounded-lg py-2 pl-2.5 pr-8 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 md:min-h-9',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2.5 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4 text-primary" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
))
SelectItem.displayName = 'SelectItem'
