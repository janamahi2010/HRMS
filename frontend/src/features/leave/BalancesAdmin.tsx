import { zodResolver } from '@hookform/resolvers/zod'
import { History, Pencil, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { DataTable, type Column } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Pagination } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ResponsiveDialog } from '@/components/ui/responsive-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDateTime, todayIST } from '@/lib/date'
import { applyFieldErrors, getErrorMessage } from '@/lib/errors'
import type { BalanceOverview, LeaveType } from '@/lib/types'
import { useAdjustBalance, useAdjustments, useBalanceOverview } from './api'

export type BalanceRow = BalanceOverview['results'][number]
type Row = BalanceRow
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function BalancesAdmin() {
  const thisYear = Number(todayIST().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Row | null>(null)
  const q = useBalanceOverview(year, search, page)
  const types = (q.data?.types ?? []).filter((t) => t.is_active)

  const columns: Column<Row>[] = [
    {
      key: 'user',
      header: 'Employee',
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.user.name} seed={r.user.id} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{r.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.user.designation || r.user.email}</p>
          </div>
        </div>
      ),
      skeletonWidth: 'w-36',
    },
    ...types.map<Column<Row>>((t) => ({
      key: `t${t.id}`,
      header: (
        <span className="inline-flex items-center gap-1.5 normal-case">
          <span className="size-2 rounded-full" style={{ background: t.color }} aria-hidden />
          {t.name.replace(/ Leave$/, '')}
        </span>
      ),
      cell: (r) => {
        const b = r.balances[t.id]
        if (!b) return <span className="text-muted-foreground">–</span>
        return t.is_paid ? (
          <span className="tabular">
            <span className="font-semibold">{num(b.available)}</span>
            <span className="text-muted-foreground"> / {num(b.total)}</span>
          </span>
        ) : (
          <span className="tabular text-muted-foreground">{num(b.used)} taken</span>
        )
      },
      skeletonWidth: 'w-12',
    })),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
          <Pencil /> Adjust
        </Button>
      ),
      className: 'text-right',
      skeletonWidth: 'w-16',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(s) => {
            setSearch(s)
            setPage(1)
          }}
          placeholder="Search employees…"
          className="sm:w-72"
          aria-label="Search employees"
        />
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="sm:w-32" aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[thisYear + 1, thisYear, thisYear - 1].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[13px] text-muted-foreground sm:ml-auto">Available / total. Booked (pending) leave counts as used.</p>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={q.data?.results}
          getRowId={(r) => r.user.id}
          isLoading={q.isLoading}
          fetching={q.isPlaceholderData}
          caption="Leave balances"
          empty={<EmptyState icon={Wallet} title={search ? 'No one matches' : 'No balances yet'} description={search ? 'Try another name.' : `Run credit_leave_balances for ${year}.`} />}
          mobileCard={(r) => (
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.user.name} seed={r.user.id} size="sm" />
                  <p className="truncate text-sm font-medium">{r.user.name}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  Adjust
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {types.map((t) => {
                  const b = r.balances[t.id]
                  return (
                    <div key={t.id} className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
                      <p className="truncate text-muted-foreground">{t.name}</p>
                      <p className="tabular font-semibold">{b ? (t.is_paid ? `${num(b.available)} / ${num(b.total)}` : `${num(b.used)} taken`) : '–'}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        />
      )}
      {q.data && q.data.total_pages > 1 && (
        <Pagination page={q.data.page} totalPages={q.data.total_pages} count={q.data.count} pageSize={q.data.page_size} onPageChange={setPage} fetching={q.isPlaceholderData} />
      )}
      <AdjustDialog row={editing} types={types} year={year} onClose={() => setEditing(null)} />
    </div>
  )
}

const schema = z.object({
  leave_type: z.string().min(1, 'Choose a leave type'),
  delta: z
    .string()
    .trim()
    .regex(/^[+-]?\d+(\.[05])?$/, 'Use whole or half days, e.g. 2 or -1.5')
    .refine((v) => Number(v) !== 0, 'Enter a non-zero amount'),
  reason: z.string().trim().min(3, 'Add a reason for the audit log').max(300),
})
type Values = z.infer<typeof schema>

export function AdjustDialog({ row, types, year, onClose }: { row: Row | null; types: LeaveType[]; year: number; onClose: () => void }) {
  const adjust = useAdjustBalance()
  const history = useAdjustments(row?.user.id)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { leave_type: '', delta: '', reason: '' } })
  const { control, register, handleSubmit, formState, reset, watch } = form
  useEffect(() => {
    if (row) reset({ leave_type: types.find((t) => t.is_paid) ? String(types.find((t) => t.is_paid)!.id) : '', delta: '', reason: '' })
  }, [row, types, reset])
  const lt = watch('leave_type')
  const delta = Number(watch('delta')) || 0
  const cur = row && lt ? row.balances[Number(lt)] : undefined

  const onSubmit = handleSubmit((v) =>
    adjust.mutate(
      { user: row!.user.id, leave_type: Number(v.leave_type), year, delta: v.delta.replace('+', ''), reason: v.reason },
      {
        onSuccess: (b) => {
          toast.success(`${b.leave_type.name} for ${row!.user.name.split(' ')[0]} is now ${b.total} days`)
          onClose()
        },
        onError: (err) => {
          if (!applyFieldErrors(err, form.setError)) toast.error(getErrorMessage(err))
        },
      },
    ),
  )

  return (
    <ResponsiveDialog
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Adjust ${row.user.name}'s balance` : ''}
      description={`${year} · every change is recorded in the audit log.`}
      footer={
        <>
          <Button variant="outline" size="lg" className="md:h-10" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button size="lg" className="md:h-10" onClick={onSubmit} loading={adjust.isPending}>
            Save adjustment
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Controller
            control={control}
            name="leave_type"
            render={({ field }) => (
              <FormField label="Leave type" error={formState.errors.leave_type?.message}>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Leave type">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.filter((t) => t.is_paid).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <FormField label="Days (+/−)" error={formState.errors.delta?.message}>
            <Input inputMode="decimal" placeholder="+2" {...register('delta')} />
          </FormField>
        </div>
        {cur && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
            Total {num(cur.total)}
            {delta !== 0 && (
              <>
                {' '}
                → <span className="font-semibold text-foreground">{num(cur.total + delta)}</span>
              </>
            )}{' '}
            · {num(cur.used)} used or booked
          </p>
        )}
        <FormField label="Reason" error={formState.errors.reason?.message}>
          <Input placeholder="e.g. Comp-off for weekend release" {...register('reason')} />
        </FormField>
        <button type="submit" hidden />
      </form>

      <div className="mt-6">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <History className="size-3.5" aria-hidden /> Recent adjustments
        </p>
        {history.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : !history.data?.length ? (
          <p className="text-[13px] text-muted-foreground">No adjustments yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.data.slice(0, 5).map((h) => (
              <li key={h.id} className="rounded-lg border border-border px-3 py-2 text-[13px]">
                <p>{h.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {h.actor ?? 'System'} · {fmtDateTime(h.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  )
}

