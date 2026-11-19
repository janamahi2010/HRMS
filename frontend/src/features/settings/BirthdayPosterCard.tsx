import { ImagePlus, RotateCcw } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BirthdayPoster } from '@/features/celebrations/BirthdayPoster'
import { getErrorMessage } from '@/lib/errors'
import { useCompany, useRemovePoster, useUploadPoster } from './api'

const MAX_BYTES = 5 * 1024 * 1024

/** Admin: choose the artwork shown on birthday cards (or keep the built-in design). */
export function BirthdayPosterCard() {
  const company = useCompany()
  const upload = useUploadPoster()
  const remove = useRemovePoster()
  const fileRef = useRef<HTMLInputElement>(null)
  const url = company.data?.birthday_poster_url ?? null

  const onFile = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use a PNG, JPG or WebP image.')
    if (file.size > MAX_BYTES) return toast.error('Poster must be 5 MB or smaller.')
    upload.mutate(file, {
      onSuccess: () => toast.success('Birthday poster updated'),
      onError: (err) => toast.error(getErrorMessage(err)),
    })
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Birthday poster</CardTitle>
          <CardDescription>
            Shown to everyone on the Home page when it's someone's birthday. The person's name is added on top automatically.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {company.isLoading ? (
          <Skeleton className="h-44 w-full max-w-xl rounded-xl" />
        ) : (
          <div className="max-w-xl">
            <BirthdayPoster
              name="Priya Sharma"
              posterUrl={url}
              subtitle={`Wishing you a wonderful year ahead, from everyone at ${company.data?.name ?? 'your company'}.`}
              className="h-44"
            />
            <p className="mt-2 text-xs text-muted-foreground">Preview with a sample name. {url ? 'Using your uploaded poster.' : 'Using the built-in design.'}</p>
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
            {url ? 'Change poster' : 'Upload poster'}
          </Button>
          {url && (
            <Button
              variant="ghost"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success('Back to the built-in design'),
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              {!remove.isPending && <RotateCcw />} Use built-in design
            </Button>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">Wide image works best (about 3:1, e.g. 1500 × 500). PNG, JPG or WebP, up to 5 MB.</p>
      </CardContent>
    </Card>
  )
}
