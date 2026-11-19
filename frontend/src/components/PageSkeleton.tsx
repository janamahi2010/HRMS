import { StatCardSkeleton } from './StatCard'
import { Card } from './ui/card'
import { Skeleton, SkeletonGroup } from './ui/skeleton'

/** Generic page skeleton: header + stat row + content card. Used as the route Suspense fallback. */
export function PageSkeleton() {
  return (
    <SkeletonGroup label="Loading page">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <Card className="mt-4 p-4 sm:mt-6 sm:p-6">
        <Skeleton className="mb-5 h-5 w-40" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </SkeletonGroup>
  )
}
