import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"

/** A linha do webhook: nome e situação, endereço, números, e o interruptor à direita. */
export function WebhookListSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-start gap-3 px-3 py-3 sm:px-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-96 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="mt-0.5 h-[18px] w-8 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}

/** As seções da página: a explicação à esquerda e os controles à direita. */
export function WebhookDetailSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      {[
        [8, 4],
        [10, 12, 28],
        [24, 16],
      ].map((blocks, section) => (
        <div
          key={section}
          className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-10 md:pt-8"
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {blocks.map((height, block) => (
              <Skeleton key={block} className="w-full rounded-lg" style={{ height: `${height * 0.25}rem` }} />
            ))}
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}
