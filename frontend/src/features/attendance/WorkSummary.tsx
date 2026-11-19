import { NotebookPen, Pencil } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { fmtRelative } from '@/lib/date'
import { getApiError, getErrorMessage } from '@/lib/errors'
import type { AttendanceRecord } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSaveWorkSummary } from './api'

export const SUMMARY_MAX = 2000

/** Still editable right now? Re-checked against the clock so a page left open past the deadline hides "Edit". */
export const isNoteEditable = (rec: Pick<AttendanceRecord, 'summary_editable' | 'summary_editable_until'>) =>
  rec.summary_editable && (!rec.summary_editable_until || Date.now() < Date.parse(rec.summary_editable_until))

/** Unsaved text is kept per attendance day in this browser, so leaving the page doesn't lose it. */
const draftKey = (recordId: number) => `hrms-note-draft:${recordId}`
export const noteDraft = {
  get(recordId: number): string | null {
    try {
      return localStorage.getItem(draftKey(recordId))
    } catch {
      return null
    }
  },
  set(recordId: number, text: string, saved: string) {
    try {
      if (text.trim() === saved.trim()) localStorage.removeItem(draftKey(recordId))
      else localStorage.setItem(draftKey(recordId), text)
    } catch {
      /* storage unavailable (private mode): nothing to keep */
    }
  },
  clear(recordId: number) {
    try {
      localStorage.removeItem(draftKey(recordId))
    } catch {
      /* ignore */
    }
  },
}

/** Re-render every minute so time-based states (the edit window) stay current. */
function useMinuteTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
}
export const SUMMARY_PLACEHOLDER = 'e.g.\n• Fixed the login bug (#142)'

/** Read-only note, e.g. for a manager looking at someone's day. */
export function WorkSummaryText({ text, className }: { text: string; className?: string }) {
  if (!text) return <p className={cn('text-sm text-muted-foreground', className)}>No work summary for this day.</p>
  return <p className={cn('whitespace-pre-line break-words text-sm leading-relaxed', className)}>{text}</p>
}

/**
 * The employee's own note for a day: shows it, and lets them write/edit it while the day is still editable.
 * `date` omitted = today.
 */
export function WorkSummaryEditor({
  record: recordProp,
  date,
  required = false,
  minChars = 10,
  compact = false,
  startEditing = false,
  onSaved,
}: {
  record: AttendanceRecord
  date?: string
  required?: boolean
  minChars?: number
  compact?: boolean
  startEditing?: boolean
  onSaved?: (rec: AttendanceRecord) => void
}) {
  const save = useSaveWorkSummary()
  const id = useId()
  // Show what the server just saved immediately, without waiting for the parent's query to refetch.
  const [record, setRecord] = useState(recordProp)
  useEffect(() => setRecord(recordProp), [recordProp])
  useMinuteTick()
  const editable = isNoteEditable(record)
  const draft = editable ? noteDraft.get(record.id) : null
  // An unsaved draft reopens the editor with the user's text, so nothing typed is lost.
  const [editing, setEditing] = useState(startEditing || draft !== null || (!record.work_summary && editable && !compact))
  const [text, setText] = useState(draft ?? record.work_summary)
  const [error, setError] = useState<string>()
  useEffect(() => setText(noteDraft.get(record.id) ?? record.work_summary), [record.id, record.work_summary])
  // Deadline passed while the page was open: drop back to read-only (the server would refuse the save).
  useEffect(() => {
    if (!editable) setEditing(false)
  }, [editable])

  const trimmed = text.trim()
  const tooShort = required && trimmed.length < minChars
  const dirty = trimmed !== record.work_summary.trim()

  const submit = () => {
    if (tooShort) return setError(`Write at least ${minChars} characters about what you did.`)
    save.mutate(
      { summary: trimmed, date },
      {
        onSuccess: (rec) => {
          noteDraft.clear(rec.id)
          setRecord(rec)
          setEditing(false)
          setError(undefined)
          toast.success(trimmed ? 'Work summary saved' : 'Work summary cleared')
          onSaved?.(rec)
        },
        onError: (err) => {
          const api = getApiError(err)
          setError(api?.field === 'summary' ? api.message : undefined)
          if (api?.field !== 'summary') toast.error(getErrorMessage(err))
        },
      },
    )
  }

  if (!editing) {
    return (
      <div className={cn('rounded-xl border border-border', compact ? 'p-3' : 'p-3.5')}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <NotebookPen className="size-3.5" aria-hidden /> Work summary
          </p>
          {editable && (
            <Button variant="ghost" size="sm" className="-my-1 h-8 px-2" onClick={() => setEditing(true)}>
              <Pencil /> {record.work_summary ? 'Edit' : 'Add'}
            </Button>
          )}
        </div>
        {record.work_summary ? (
          <WorkSummaryText text={record.work_summary} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {editable ? 'What did you work on? Add a few lines for your manager.' : 'No work summary for this day.'}
          </p>
        )}
        {record.work_summary_updated_at && (
          <p className="mt-1.5 text-xs text-muted-foreground">Updated {fmtRelative(record.work_summary_updated_at)}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <NotebookPen className="size-4 text-primary" aria-hidden />
          What did you work on{date ? '' : ' today'}?
          {required && <span className="text-xs font-normal text-muted-foreground">(required)</span>}
        </span>
        <span className={cn('tabular text-xs font-normal', text.length > SUMMARY_MAX ? 'text-destructive' : 'text-muted-foreground')}>
          {text.length}/{SUMMARY_MAX}
        </span>
      </label>
      <Textarea
        id={id}
        rows={compact ? 3 : 4}
        maxLength={SUMMARY_MAX}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        placeholder={SUMMARY_PLACEHOLDER}
        onChange={(e) => {
          setText(e.target.value)
          noteDraft.set(record.id, e.target.value, record.work_summary)
          setError(undefined)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {(record.work_summary || !editable || draft !== null) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              noteDraft.clear(record.id)
              setText(record.work_summary)
              setEditing(false)
              setError(undefined)
            }}
            disabled={save.isPending}
          >
            Cancel
          </Button>
        )}
        {draft !== null && dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved draft</span>}
        <Button size="sm" onClick={submit} loading={save.isPending} disabled={!dirty && !!record.work_summary}>
          Save summary
        </Button>
      </div>
    </div>
  )
}
