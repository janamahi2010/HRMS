import { zodResolver } from '@hookform/resolvers/zod'
import { lazy, Suspense, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { OfficeLocation } from '@/lib/types'
import { useSaveLocation } from './api'
import type { LatLng } from './LocationPicker'

// Leaflet (+ its CSS) is only downloaded when this dialog opens.
const LocationPicker = lazy(() => import('./LocationPicker'))

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  address: z.string().trim().max(255),
  radius_m: z.coerce.number<number>().int().min(20, 'Minimum 20 m').max(5000, 'Maximum 5000 m'),
  is_active: z.boolean(),
  // Not a type predicate on purpose: keeps input/output types identical for react-hook-form.
  position: z.custom<LatLng | null>().refine((v): boolean => Boolean(v), 'Drop a pin on the map'),
})
type Values = z.infer<typeof schema>

function toValues(l?: OfficeLocation | null): Values {
  return {
    name: l?.name ?? '',
    address: l?.address ?? '',
    radius_m: l?.radius_m ?? 100,
    is_active: l?.is_active ?? true,
    position: l ? { lat: Number(l.latitude), lng: Number(l.longitude) } : null,
  }
}

export function LocationDialog({
  open,
  onOpenChange,
  location,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  location?: OfficeLocation | null
}) {
  const save = useSaveLocation()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(location) })
  const { register, control, handleSubmit, formState, reset, watch, setValue } = form
  const radius = watch('radius_m')

  useEffect(() => {
    if (open) reset(toValues(location))
  }, [open, location, reset])

  const onSubmit = handleSubmit((v) =>
    save.mutate(
      {
        id: location?.id,
        data: {
          name: v.name,
          address: v.address,
          radius_m: v.radius_m,
          is_active: v.is_active,
          latitude: v.position!.lat,
          longitude: v.position!.lng,
        },
      },
      {
        onSuccess: (l) => {
          toast.success(location ? `${l.name} updated` : `${l.name} added`)
          onOpenChange(false)
        },
        onError: (err) => {
          if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
        },
      },
    ),
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={location ? `Edit ${location.name}` : 'Add office location'}
      description="Employees can only check in within the radius around this pin."
      className="md:max-w-2xl"
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={save.isPending}>
            {location ? 'Save changes' : 'Add location'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <FormField label="Name" error={formState.errors.name?.message}>
            <Input placeholder="Head Office" {...register('name')} />
          </FormField>
          <FormField label="Radius (m)" error={formState.errors.radius_m?.message}>
            <Input type="number" inputMode="numeric" min={20} max={5000} step={10} {...register('radius_m')} />
          </FormField>
        </div>
        <input
          type="range"
          min={20}
          max={1000}
          step={10}
          value={Math.min(Number(radius) || 20, 1000)}
          onChange={(e) => setValue('radius_m', Number(e.target.value), { shouldDirty: true })}
          className="w-full accent-[var(--primary)]"
          aria-label="Radius slider"
        />

        <div>
          <Controller
            control={control}
            name="position"
            render={({ field }) =>
              open ? (
                <Suspense fallback={<Skeleton className="h-[22rem] w-full rounded-xl sm:h-[24rem]" />}>
                  <LocationPicker
                    value={field.value}
                    radius={Number(radius) || 100}
                    onChange={(p, address) => {
                      field.onChange(p)
                      if (address) setValue('address', address.slice(0, 255), { shouldDirty: true })
                    }}
                  />
                </Suspense>
              ) : (
                <></>
              )
            }
          />
          {formState.errors.position && (
            <p role="alert" className="mt-2 text-[13px] text-destructive">
              {formState.errors.position.message}
            </p>
          )}
        </div>

        <FormField label="Address" error={formState.errors.address?.message} hint="Filled from search; edit freely.">
          <Input placeholder="Street, area, city" {...register('address')} />
        </FormField>

        <Controller
          control={control}
          name="is_active"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-[13px] text-muted-foreground">Inactive offices reject all check-ins.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
        <button type="submit" hidden />
      </form>
    </ResponsiveDialog>
  )
}
