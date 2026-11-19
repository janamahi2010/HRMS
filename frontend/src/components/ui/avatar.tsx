import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { avatarColor, cn, initials } from '@/lib/utils'

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-[13px]',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
} as const

interface AvatarProps {
  name: string
  src?: string | null
  size?: keyof typeof sizes
  className?: string
  /** Seed for color; defaults to name */
  seed?: string | number
}

export function Avatar({ name, src, size = 'md', className, seed }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative inline-flex shrink-0 select-none overflow-hidden rounded-full', sizes[size], className)}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        className={cn('flex size-full items-center justify-center font-semibold', avatarColor(seed ?? name))}
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
