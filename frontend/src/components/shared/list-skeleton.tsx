import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { LoadingRegion } from "./loading-region"

// Larguras que variam, para o esqueleto parecer texto e não uma grade de tijolos.
const TITLE_WIDTHS = ["w-1/2", "w-2/5", "w-3/5", "w-1/3", "w-1/2", "w-2/5"]
const LINE_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-3/5", "w-2/3", "w-3/4"]

export type ListSkeletonProps = {
  rows?: number
  /** Círculo à esquerda, para listas de pessoas e conversas. */
  avatar?: boolean
  /** Segunda linha de texto em cada item. */
  twoLines?: boolean
  className?: string
}

/** Enquanto uma lista carrega: conversas, contatos, notificações. */
export function ListSkeleton({
  rows = 6,
  avatar = false,
  twoLines = true,
  className,
}: ListSkeletonProps) {
  return (
    <LoadingRegion className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b py-3 last:border-b-0">
          {avatar && <Skeleton className="size-8 shrink-0 rounded-full" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn("h-3.5", TITLE_WIDTHS[index % TITLE_WIDTHS.length])} />
            {twoLines && (
              <Skeleton className={cn("h-3", LINE_WIDTHS[index % LINE_WIDTHS.length])} />
            )}
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}
