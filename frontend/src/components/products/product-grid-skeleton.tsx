import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** A mesma grade dos cards: o esqueleto e a tela final ocupam o mesmo lugar. */
export const PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:gap-x-4 md:gap-y-6 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"

export function ProductGridSkeleton({ cards = 12 }: { cards?: number }) {
  return (
    <LoadingRegion className={cn(PRODUCT_GRID_CLASS)}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex flex-col gap-2.5">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div className="flex flex-col gap-1.5 px-0.5">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="hidden h-3 w-full md:block" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}
