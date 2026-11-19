import { useState } from 'react'
import { format } from 'date-fns'
import { parseISODate } from '@/lib/date'
import type { DashboardData } from './api'

type Point = NonNullable<DashboardData['company']>['trend'][number]

/**
 * Attendance rate over recent working days. One series -> one hue (brand primary), no legend
 * (the card title names it). Thin bars with 4px rounded data-ends on the baseline, 2px gaps,
 * a recessive grid, hover/focus tooltip per bar, and a screen-reader table.
 */
export function TrendChart({ data }: { data: Point[] }) {
  const [active, setActive] = useState<number | null>(null)
  const H = 140
  const grid = [0, 50, 100]
  const a = active != null ? data[active] : null

  return (
    <div>
      <div className="relative" style={{ height: H + 24 }} onMouseLeave={() => setActive(null)}>
        {/* gridlines */}
        {grid.map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ bottom: 24 + (g / 100) * H - 6 }}>
            <span className="tabular w-8 text-right text-[11px] text-muted-foreground">{g}%</span>
            <span className="h-px flex-1 bg-border/70" />
          </div>
        ))}
        {/* bars */}
        <div className="absolute bottom-6 left-10 right-0 flex items-end gap-[2px]" style={{ height: H }} role="presentation">
          {data.map((p, i) => (
            <button
              key={p.date}
              type="button"
              aria-label={`${format(parseISODate(p.date), 'EEE d MMM')}: ${p.rate}% attended`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group flex h-full flex-1 items-end justify-center focus-visible:outline-none"
            >
              <span
                className="w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-100 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                style={{ height: `${Math.max(p.rate, 1.5)}%`, opacity: active == null || active === i ? 1 : 0.45 }}
              />
            </button>
          ))}
        </div>
        {/* x labels: first, middle, last only (selective labelling) */}
        <div className="absolute inset-x-0 bottom-0 left-10 flex gap-[2px]">
          {data.map((p, i) => (
            <span key={p.date} className="flex-1 text-center text-[11px] text-muted-foreground">
              {i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2) ? format(parseISODate(p.date), 'd MMM') : ''}
            </span>
          ))}
        </div>
        {a && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg animate-fade-in"
            style={{ left: `clamp(5rem, calc(2.5rem + (100% - 2.5rem) * ${(active! + 0.5) / data.length}), calc(100% - 5rem))`, top: -8 }}
          >
            <p className="font-semibold">{format(parseISODate(a.date), 'EEE, d MMM')}</p>
            <p className="tabular mt-0.5 text-foreground">{a.rate}% attended</p>
            <p className="tabular text-muted-foreground">
              {a.present + a.late + a.half_day} in · {a.late} late · {a.absent} absent · {a.on_leave} on leave
            </p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Attendance rate by day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Rate</th>
            <th>Present</th>
            <th>Late</th>
            <th>Absent</th>
            <th>On leave</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.rate}%</td>
              <td>{p.present}</td>
              <td>{p.late}</td>
              <td>{p.absent}</td>
              <td>{p.on_leave}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
