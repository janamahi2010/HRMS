import { useEffect, useState, type ReactNode } from 'react'
import { Button } from './ui/button'
import { FormField } from './ui/form-field'
import { Textarea } from './ui/input'
import { ResponsiveDialog } from './ui/responsive-dialog'

interface DecisionDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: 'approve' | 'reject'
  title: string
  summary?: ReactNode
  loading?: boolean
  onConfirm: (comment: string) => void
}

/** Approve / reject with an optional comment (reject asks for a reason so the requester knows why). */
export function DecisionDialog({ open, onOpenChange, mode, title, summary, loading, onConfirm }: DecisionDialogProps) {
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (open) {
      setComment('')
      setError(undefined)
    }
  }, [open])

  const submit = () => {
    if (mode === 'reject' && comment.trim().length < 3) return setError('Add a short reason for the rejection')
    onConfirm(comment.trim())
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="md:h-10"
            variant={mode === 'approve' ? 'success' : 'destructive'}
            onClick={submit}
            loading={loading}
          >
            {mode === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {summary}
        <FormField label={mode === 'approve' ? 'Comment (optional)' : 'Reason'} error={error}>
          <Textarea
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              setError(undefined)
            }}
            placeholder={mode === 'approve' ? 'Add a note for the requester' : 'Let them know why'}
            autoFocus
          />
        </FormField>
      </div>
    </ResponsiveDialog>
  )
}
