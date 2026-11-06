import { LoadingRegion, StatTile } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function CardSkeleton({ className, bodyClassName }: { className?: string; bodyClassName?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className={cn("h-52 w-full", bodyClassName)} />
    </div>
  )
}

function Tiles({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <StatTile key={index} label="" value={0} loading />
      ))}
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-full max-w-xl" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Tiles count={4} className="lg:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-12">
        <CardSkeleton className="lg:col-span-8" />
        <CardSkeleton className="lg:col-span-4" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <CardSkeleton className="lg:col-span-8" />
        <CardSkeleton className="lg:col-span-4" />
      </div>
    </LoadingRegion>
  )
}

export function AgendaSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <Tiles count={5} className="lg:grid-cols-5" />
      <CardSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <CardSkeleton bodyClassName="h-32" />
        <CardSkeleton bodyClassName="h-32" />
        <CardSkeleton bodyClassName="h-32" />
      </div>
    </LoadingRegion>
  )
}
