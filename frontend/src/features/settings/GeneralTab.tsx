import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { BrandMark } from '@/components/BrandMark'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import { BirthdayPosterCard } from './BirthdayPosterCard'
import { useCompany, useRemoveLogo, useUpdateCompany, useUploadLogo } from './api'

const schema = z.object({ name: z.string().trim().min(2, 'Company name is required').max(150) })
const MAX_BYTES = 2 * 1024 * 1024

export function GeneralTab() {
  const company = useCompany()
  const update = useUpdateCompany()
  const upload = useUploadLogo()
  const removeLogo = useRemoveLogo()
  const fileRef = useRef<HTMLInputElement>(null)
  const form = useForm<{ name: string }>({ resolver: zodResolver(schema), values: { name: company.data?.name ?? '' } })

  if (company.isPending) {
    return (
      <SkeletonGroup>
        <Card className="space-y-6 p-6">
          <Skeleton className="h-5 w-40" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        </Card>
      </SkeletonGroup>
    )
  }
  if (company.isError) return <Card><ErrorState error={company.error} onRetry={() => company.refetch()} /></Card>

  const onFile = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use a PNG, JPG or WebP image.')
    if (file.size > MAX_BYTES) return toast.error('Logo must be 2 MB or smaller.')
    upload.mutate(file, {
      onSuccess: () => toast.success('Logo updated'),
      onError: (err) => toast.error(getErrorMessage(err)),
    })
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Company profile</CardTitle>
          <CardDescription>Shown in the sidebar and on every email your team receives.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          {company.data.logo_url ? (
            <img src={company.data.logo_url} alt="Company logo" className="size-16 rounded-xl border border-border object-cover" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border">
              <BrandMark name={company.data.name} showName={false} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                onFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
              {!upload.isPending && <ImagePlus />}
              {company.data.logo_url ? 'Change logo' : 'Upload logo'}
            </Button>
            {company.data.logo_url && (
              <Button
                variant="ghost"
                className="text-destructive"
                loading={removeLogo.isPending}
                onClick={() =>
                  removeLogo.mutate(undefined, {
                    onSuccess: () => toast.success('Logo removed'),
                    onError: (err) => toast.error(getErrorMessage(err)),
                  })
                }
              >
                {!removeLogo.isPending && <Trash2 />} Remove
              </Button>
            )}
          </div>
          <p className="w-full text-[13px] text-muted-foreground">Square PNG, JPG or WebP, up to 2 MB.</p>
        </div>

        <form
          onSubmit={form.handleSubmit((v) =>
            update.mutate(v, {
              onSuccess: () => {
                toast.success('Company name updated')
              },
              onError: (err) => {
                if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
              },
            }),
          )}
          className="flex max-w-md flex-col gap-4 sm:flex-row sm:items-end"
          noValidate
        >
          <FormField label="Company name" error={form.formState.errors.name?.message} className="flex-1">
            <Input autoComplete="organization" {...form.register('name')} />
          </FormField>
          <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
    <BirthdayPosterCard />
    </div>
  )
}
