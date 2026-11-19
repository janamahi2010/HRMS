import { cn } from '@/lib/utils'

/**
 * The visual part of a birthday card.
 * - With an admin-uploaded poster: the artwork, with the person's name on a soft scrim so it stays readable.
 * - Without one: a built-in design (gradient, balloons, confetti), no external assets.
 */
export function BirthdayPoster({
  name,
  posterUrl,
  subtitle,
  className,
  celebrate = false,
}: {
  name: string
  posterUrl?: string | null
  subtitle?: string
  className?: string
  /** One-off confetti burst (the birthday person's own card). Respects reduced-motion. */
  celebrate?: boolean
}) {
  return (
    <div
      className={cn('relative isolate overflow-hidden rounded-xl', posterUrl ? 'bg-muted' : 'bg-linear-to-br from-indigo-600 via-violet-600 to-pink-600', className)}
      role="img"
      aria-label={`Happy birthday, ${name}!`}
    >
      {posterUrl ? (
        <>
          <img src={posterUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          {/* Shade behind the text (left + bottom) so any artwork keeps the name readable. */}
          <div className="absolute inset-0 -z-10 bg-linear-to-r from-black/65 via-black/30 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-linear-to-t from-black/60 to-transparent" aria-hidden />
        </>
      ) : (
        <DefaultArt />
      )}
      {celebrate && <Confetti />}
      <div
        className={cn('flex h-full flex-col justify-end p-5 text-white sm:p-6', !posterUrl && 'justify-center')}
        style={posterUrl ? { textShadow: '0 1px 2px rgb(0 0 0 / 0.55), 0 0 12px rgb(0 0 0 / 0.35)' } : undefined}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/85">Happy birthday</p>
        <p className="mt-1 text-2xl font-bold leading-tight tracking-tight drop-shadow-sm sm:text-3xl">{name} 🎂</p>
        {subtitle && <p className="mt-1.5 max-w-md text-sm text-white/90">{subtitle}</p>}
      </div>
    </div>
  )
}

/** Balloons + confetti in pure SVG/CSS: crisp at any size, no image download. */
function DefaultArt() {
  // Kept to the top/bottom edges and the right side, so nothing ever sits on the name or message.
  const dots = [
    [6, 8, '#fde68a'], [24, 6, '#a5f3fc'], [42, 9, '#fbcfe8'], [14, 90, '#bbf7d0'], [33, 92, '#fde68a'],
    [52, 88, '#a5f3fc'], [60, 14, '#bbf7d0'], [66, 70, '#fbcfe8'], [72, 34, '#fde68a'], [58, 50, '#a5f3fc'],
  ] as const
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      {dots.map(([x, y, c], i) => (
        <span
          key={i}
          className="absolute size-2 rounded-[2px] opacity-80"
          style={{ left: `${x}%`, top: `${y}%`, background: c, transform: `rotate(${i * 37}deg)` }}
        />
      ))}
      <svg viewBox="0 0 120 140" className="absolute -right-2 top-1/2 h-[120%] -translate-y-1/2 opacity-95 sm:right-6">
        <g>
          <path d="M40 92 C 38 108, 46 118, 40 138" stroke="white" strokeOpacity=".6" fill="none" strokeWidth="1.2" />
          <ellipse cx="40" cy="62" rx="20" ry="25" fill="#fbbf24" />
          <path d="M37 86 l3 6 l3 -6z" fill="#f59e0b" />
          <ellipse cx="33" cy="52" rx="5" ry="8" fill="white" opacity=".35" />
        </g>
        <g>
          <path d="M78 84 C 82 102, 72 116, 80 138" stroke="white" strokeOpacity=".6" fill="none" strokeWidth="1.2" />
          <ellipse cx="78" cy="50" rx="22" ry="28" fill="#f472b6" />
          <path d="M75 77 l3 7 l3 -7z" fill="#db2777" />
          <ellipse cx="70" cy="39" rx="5" ry="9" fill="white" opacity=".35" />
        </g>
        <g>
          <path d="M100 98 C 96 112, 104 124, 98 138" stroke="white" strokeOpacity=".6" fill="none" strokeWidth="1.2" />
          <ellipse cx="100" cy="74" rx="15" ry="19" fill="#38bdf8" />
          <path d="M98 92 l2 5 l2 -5z" fill="#0284c7" />
        </g>
      </svg>
    </div>
  )
}

function Confetti() {
  const colors = ['#fde68a', '#f472b6', '#a5f3fc', '#bbf7d0', '#c4b5fd', '#fdba74']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 h-2.5 w-1.5 rounded-[1px]"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 90}ms`,
            animationDuration: `${1600 + (i % 5) * 220}ms`,
          }}
        />
      ))}
    </div>
  )
}
