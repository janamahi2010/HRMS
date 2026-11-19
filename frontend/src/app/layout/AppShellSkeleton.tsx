import { PageSkeleton } from '@/components/PageSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors AppLayout while the session bootstraps, so there's never a blank screen. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2 px-3 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex h-10 items-center gap-3 px-3">
              <Skeleton className="size-[18px] rounded" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </aside>
      <div className="md:pl-60">
        <header className="flex h-14 items-center border-b border-border px-4 sm:px-6 md:h-16 lg:px-8">
          <Skeleton className="size-8 rounded-lg md:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-8">
          <PageSkeleton />
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around border-t border-border bg-card md:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}
