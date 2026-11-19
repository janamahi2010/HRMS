import { formatInTimeZone } from 'date-fns-tz'
import {
  Ban,
  CalendarCheck,
  Coffee,
  ExternalLink,
  Globe,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  PartyPopper,
  Palmtree,
  RotateCw,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/ErrorState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { GeoError, getBestFix, useGeoPermission, type GeoErrorKind } from '@/hooks/useGeolocation'
import { fmtDay, fmtMinutes, fmtTime, TZ } from '@/lib/date'
import { getApiError, getErrorMessage } from '@/lib/errors'
import type { TodayState } from '@/lib/types'
import { cn } from '@/lib/utils'
import { usePunch, useSaveWorkSummary, useServerNow, useToday } from './api'
import { noteDraft, SUMMARY_MAX, SUMMARY_PLACEHOLDER, WorkSummaryEditor } from './WorkSummary'

type Phase =
  | { kind: 'idle' }
  | { kind: 'locating'; accuracy?: number }
  | { kind: 'sending' }
  | { kind: 'error'; code: string; message: string; extra?: Record<string, unknown> }

const GEO_ERRORS: Record<GeoErrorKind, string> = {
  denied:
    "Location access is blocked for this site. Tap the lock icon in your browser's address bar, allow Location, then try again.",
  insecure: 'Location only works over a secure (https) connection.',
  unsupported: "This browser can't share your location. Try Chrome, Safari or Edge.",
  unavailable: "We couldn't get a GPS fix. Turn on location services for your browser and try again.",
  timeout: 'Getting your location took too long. Move near a window or open area and try again.',
}

const BLOCKED_ICON: Record<string, LucideIcon> = {
  holiday: PartyPopper,
  weekly_off: Coffee,
  on_leave: Palmtree,
  no_office: MapPinOff,
  office_inactive: Ban,
  already_recorded: CalendarCheck,
}

/** "09:30" -> "09:30 AM" */
const clock = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

export function CheckInCard({ className }: { className?: string }) {
  const today = useToday()
  if (today.isLoading) return <CheckInCardSkeleton className={className} />
  if (today.isError || !today.data)
    return (
      <Card className={className}>
        <ErrorState compact error={today.error} onRetry={() => today.refetch()} retrying={today.isFetching} />
      </Card>
    )
  return <CheckInCardBody state={today.data} fetchedAt={today.dataUpdatedAt} className={className} />
}

function CheckInCardBody({ state, fetchedAt, className }: { state: TodayState; fetchedAt: number; className?: string }) {
  const now = useServerNow(state.server_time, fetchedAt)
  const permission = useGeoPermission()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const rec = state.record
  const checkedIn = !!rec?.check_in_at
  const checkedOut = !!rec?.check_out_at
  const action = checkedIn ? 'check-out' : 'check-in'
  const punch = usePunch(action)
  const busy = phase.kind === 'locating' || phase.kind === 'sending'
  const [askSummary, setAskSummary] = useState(false)

  // Check-out goes through the work-summary step first; check-in goes straight to GPS.
  const onPunchClick = () => (checkedIn ? setAskSummary(true) : run())

  async function run() {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setPhase({ kind: 'locating' })
    try {
      let fix: Awaited<ReturnType<typeof getBestFix>> | null
      if (state.remote_allowed) {
        // Remote people are never blocked: share the location if we can get it quickly, otherwise go without.
        fix = await getBestFix({ signal: ctrl.signal, maxWaitMs: 6_000, onProgress: (accuracy) => setPhase({ kind: 'locating', accuracy }) }).catch(
          (e) => {
            if (e instanceof DOMException && e.name === 'AbortError') throw e
            return null
          },
        )
      } else {
        fix = await getBestFix({
          signal: ctrl.signal,
          onProgress: (accuracy) => setPhase({ kind: 'locating', accuracy }),
        })
      }
      setPhase({ kind: 'sending' })
      const next = await punch.mutateAsync(fix)
      setPhase({ kind: 'idle' })
      const r = next.record
      if (action === 'check-in' && r?.check_in_at)
        toast.success(`Checked in at ${fmtTime(r.check_in_at)}`, { description: r.is_late ? 'Marked late today.' : 'Have a great day!' })
      else if (r?.check_out_at) toast.success(`Checked out · ${fmtMinutes(r.worked_minutes)} worked`)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof GeoError) return setPhase({ kind: 'error', code: err.kind, message: GEO_ERRORS[err.kind] })
      const api = getApiError(err)
      if (api?.code === 'work_summary_required') {
        setPhase({ kind: 'idle' })
        return setAskSummary(true)
      }
      setPhase({ kind: 'error', code: api?.code ?? 'error', message: getErrorMessage(err), extra: api ?? undefined })
    }
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header: date + live server clock */}
      <div className="flex items-start justify-between gap-3 border-b border-border bg-linear-to-br from-primary-soft/70 to-transparent px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today</p>
          <p className="mt-0.5 text-base font-semibold">{fmtDay(state.date + 'T12:00:00+05:30')}</p>
        </div>
        <div className="text-right">
          <p className="tabular text-lg font-semibold tracking-tight" aria-label="Current time">
            {formatInTimeZone(now, TZ, 'hh:mm:ss')}
            <span className="ml-1 text-xs font-medium text-muted-foreground">{formatInTimeZone(now, TZ, 'a')}</span>
          </p>
          {rec && <StatusBadge status={rec.status} className="mt-1" />}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {checkedOut && rec ? (
          <>
            <DoneSummary checkIn={rec.check_in_at!} checkOut={rec.check_out_at!} minutes={rec.worked_minutes} />
            <WorkSummaryEditor record={rec} required={state.work_summary_required} minChars={state.work_summary_min_chars} compact />
          </>
        ) : checkedIn && rec ? (
          <>
            <WorkingTimer state={state} now={now} />
            <WorkSummaryEditor record={rec} required={state.work_summary_required} minChars={state.work_summary_min_chars} compact />
          </>
        ) : state.blocked ? (
          <Blocked code={state.blocked.code} message={state.blocked.message} />
        ) : (
          <ReadyInfo state={state} />
        )}

        {state.leave?.is_half_day && !checkedOut && (
          <p className="rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info-soft-foreground">
            Approved half-day {state.leave.type.toLowerCase()} ({state.leave.half} half). Required hours are halved today.
          </p>
        )}

        {(state.can_check_in || state.can_check_out) && (
          <>
            {permission === 'denied' && phase.kind !== 'error' && !state.remote_allowed && (
              <Notice tone="warning" icon={ShieldAlert} title="Location is blocked">
                {GEO_ERRORS.denied}
              </Notice>
            )}
            <Button
              size="xl"
              variant={checkedIn ? 'outline' : 'default'}
              className="w-full"
              onClick={onPunchClick}
              loading={phase.kind === 'sending'}
              disabled={busy}
            >
              {phase.kind === 'locating' ? (
                <Loader2 className="animate-spin" />
              ) : phase.kind === 'sending' ? null : checkedIn ? (
                <LogOut />
              ) : (
                <LogIn />
              )}
              {phase.kind === 'locating'
                ? 'Getting your location…'
                : phase.kind === 'sending'
                  ? checkedIn
                    ? 'Checking out…'
                    : 'Checking in…'
                  : checkedIn
                    ? 'Check out'
                    : 'Check in'}
            </Button>
          </>
        )}

        <div aria-live="polite" className="empty:hidden">
          {phase.kind === 'locating' && (
            <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <LocateFixed className="size-4 animate-pulse text-primary" aria-hidden />
              {phase.accuracy ? `Improving accuracy… ±${Math.round(phase.accuracy)} m` : 'Waiting for GPS…'}
            </p>
          )}
          {phase.kind === 'error' && <PunchError phase={phase} state={state} onRetry={run} />}
        </div>
      </div>
      {rec && (
        <CheckOutSummaryDialog
          open={askSummary}
          onOpenChange={setAskSummary}
          recordId={rec.id}
          initial={rec.work_summary}
          required={state.work_summary_required}
          minChars={state.work_summary_min_chars}
          onConfirm={() => {
            setAskSummary(false)
            void run()
          }}
        />
      )}
    </Card>
  )
}

/** Step before check-out: "What did you work on today?" Saved first, so it's kept even if the GPS check fails. */
function CheckOutSummaryDialog({
  open,
  onOpenChange,
  recordId,
  initial,
  required,
  minChars,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  recordId: number
  initial: string
  required: boolean
  minChars: number
  onConfirm: () => void
}) {
  const save = useSaveWorkSummary()
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (open) {
      setText(noteDraft.get(recordId) ?? initial)
      setError(undefined)
    }
  }, [open, initial, recordId])

  const trimmed = text.trim()
  const submit = () => {
    if (required && trimmed.length < minChars) return setError(`Write at least ${minChars} characters about what you did today.`)
    if (trimmed === initial.trim()) {
      noteDraft.clear(recordId)
      return onConfirm()
    }
    save.mutate(
      { summary: trimmed },
      {
        onSuccess: () => {
          noteDraft.clear(recordId)
          onConfirm()
        },
        onError: (err) => setError(getErrorMessage(err)),
      },
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Before you check out"
      description={
        required ? 'Your company asks for a short summary of your day.' : 'Add a few lines about your day for your manager (optional).'
      }
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={submit} loading={save.isPending}>
            {!save.isPending && <LogOut />}
            {!required && !trimmed ? 'Check out without notes' : 'Save & check out'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label htmlFor="checkout-summary" className="flex items-center justify-between text-sm font-medium">
          What did you work on today?
          <span className="tabular text-xs font-normal text-muted-foreground">
            {text.length}/{SUMMARY_MAX}
          </span>
        </label>
        <Textarea
          id="checkout-summary"
          rows={5}
          autoFocus
          maxLength={SUMMARY_MAX}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'checkout-summary-err' : 'checkout-summary-hint'}
          placeholder={SUMMARY_PLACEHOLDER}
          onChange={(e) => {
            setText(e.target.value)
            noteDraft.set(recordId, e.target.value, initial)
            setError(undefined)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          }}
        />
        {error ? (
          <p id="checkout-summary-err" role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : (
          <p id="checkout-summary-hint" className="text-[13px] text-muted-foreground">
            You can still edit this until noon tomorrow. Visible to you, your manager and admins.
          </p>
        )}
      </div>
    </ResponsiveDialog>
  )
}

function ReadyInfo({ state }: { state: TodayState }) {
  const { office, timings } = state
  return (
    <div className="space-y-3">
      {state.remote_allowed ? (
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <Globe className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Check in from anywhere</p>
            <p className="truncate text-[13px] text-muted-foreground">
              You can work remotely{office ? ` or at ${office.name}` : ''}. Your location is shared if available.
            </p>
          </div>
        </div>
      ) : office && (
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <MapPin className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{office.name}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              Check in within {office.radius_m} m{office.address ? ` · ${office.address}` : ''}
            </p>
          </div>
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">
        Shift {clock(timings.office_start)} – {clock(timings.office_end)} · Late after {clock(timings.late_after)}
      </p>
    </div>
  )
}

function WorkingTimer({ state, now }: { state: TodayState; now: Date }) {
  const rec = state.record!
  const start = Date.parse(rec.check_in_at!)
  const elapsed = now.getTime() - start
  const [sh = 0, sm = 0] = state.timings.office_start.split(':').map(Number)
  const [eh = 0, em = 0] = state.timings.office_end.split(':').map(Number)
  const shiftMs = Math.max(1, (eh * 60 + em - (sh * 60 + sm)) * 60_000)
  const halfDayMs = state.timings.half_day_hours * 3_600_000 * (state.leave?.is_half_day ? 0.5 : 1)
  const pct = Math.min(100, (elapsed / shiftMs) * 100)
  const halfPct = Math.min(100, (halfDayMs / shiftMs) * 100)

  return (
    <div className="text-center">
      <p className="text-[13px] text-muted-foreground">Time worked today</p>
      <p className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-[2.75rem]" role="timer" aria-live="off">
        {hms(elapsed)}
      </p>
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground/30" style={{ left: `${halfPct}%` }} title="Half-day threshold" />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>In {fmtTime(rec.check_in_at!)}</span>
        <span>{elapsed < halfDayMs ? `${fmtMinutes(Math.ceil((halfDayMs - elapsed) / 60_000))} to avoid half-day` : 'Full day reached'}</span>
      </div>
      {rec.source === 'remote' ? (
        <p className="mt-3 text-xs text-muted-foreground">Checked in remotely</p>
      ) : (
        rec.check_in_distance_m != null &&
        rec.office && (
          <p className="mt-3 text-xs text-muted-foreground">
            Checked in {metres(rec.check_in_distance_m)} from {rec.office}
          </p>
        )
      )}
    </div>
  )
}

function DoneSummary({ checkIn, checkOut, minutes }: { checkIn: string; checkOut: string; minutes: number }) {
  const items = [
    { label: 'Check in', value: fmtTime(checkIn) },
    { label: 'Check out', value: fmtTime(checkOut) },
    { label: 'Worked', value: fmtMinutes(minutes) },
  ]
  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border">
        {items.map((i) => (
          <div key={i.label} className="px-2 py-3 text-center">
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="tabular mt-0.5 text-sm font-semibold">{i.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[13px] text-muted-foreground">You're done for today. See you tomorrow!</p>
    </div>
  )
}

function Blocked({ code, message }: { code: string; message: string }) {
  const Icon = BLOCKED_ICON[code] ?? CalendarCheck
  const warn = code === 'no_office' || code === 'office_inactive'
  return (
    <div className="flex flex-col items-center py-3 text-center">
      <div
        className={cn(
          'mb-3 flex size-12 items-center justify-center rounded-2xl',
          warn ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-info-soft text-info-soft-foreground',
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function PunchError({
  phase,
  state,
  onRetry,
}: {
  phase: Extract<Phase, { kind: 'error' }>
  state: TodayState
  onRetry: () => void
}) {
  const office = state.office
  const outside = phase.code === 'outside_radius'
  const title =
    {
      outside_radius: "You're outside the office radius",
      low_accuracy: 'Location not precise enough',
      denied: 'Location permission needed',
      timeout: 'Location timed out',
      unavailable: 'Location unavailable',
      insecure: 'Secure connection required',
      unsupported: 'Location not supported',
    }[phase.code] ?? "Couldn't record your punch"

  return (
    <Notice tone={outside || phase.code === 'low_accuracy' ? 'warning' : 'danger'} icon={outside ? MapPinOff : TriangleAlert} title={title}>
      <p>{phase.message}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onRetry} className="bg-card">
          <RotateCw /> Try again
        </Button>
        {outside && office && (
          <Button size="sm" variant="ghost" asChild>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${office.latitude},${office.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink /> Directions to {office.name}
            </a>
          </Button>
        )}
      </div>
    </Notice>
  )
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'warning' | 'danger'
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-xl p-3 text-[13px] animate-fade-in',
        tone === 'danger' ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 opacity-90">{children}</div>
      </div>
    </div>
  )
}

export function CheckInCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)} aria-busy="true" aria-label="Loading today's attendance">
      <div className="flex items-start justify-between border-b border-border px-5 py-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-28" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Card>
  )
}
