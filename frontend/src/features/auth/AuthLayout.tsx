import { CalendarCheck2, MapPin, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandMark } from '@/components/BrandMark'

const FEATURES = [
  { icon: MapPin, title: 'Location-verified attendance', text: 'One-tap check-in, verified against your office geofence.' },
  { icon: CalendarCheck2, title: 'Leave without the back-and-forth', text: 'Apply, approve and track balances in seconds.' },
  { icon: ShieldCheck, title: 'Secure by default', text: 'Role-based access keeps every team’s data private.' },
]

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden w-[44%] max-w-xl overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/15 font-bold backdrop-blur">H</div>
          <span className="text-lg font-semibold tracking-tight">HRMS</span>
        </div>
        <div className="relative mt-auto mb-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Attendance and leave, handled.
          </h2>
          <p className="mt-3 text-indigo-100">Everything your team needs to show up, take time off and stay in sync.</p>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="mt-0.5 text-sm text-indigo-100">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-indigo-200">© {new Date().getFullYear()} HRMS</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[400px]">
          <BrandMark className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
