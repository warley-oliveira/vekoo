import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { LoadingRegion } from "./loading-region"

const LABEL_WIDTHS = ["w-20", "w-24", "w-16", "w-28", "w-20"]
const VALUE_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"]

export type DetailSkeletonProps = {
  /** Linhas de rótulo e valor. */
  rows?: number
  /** Cabeçalho com avatar e nome, como no painel de um contato. */
  avatar?: boolean
  className?: string
}

/** Detalhe de um registro carregando, dentro de `ResponsiveDialog` ou de uma página própria. */
export function DetailSkeleton({
  rows = 5,
  avatar = true,
  className,
}: DetailSkeletonProps) {
  return (
    <LoadingRegion className={cn("flex flex-col gap-6", className)}>
      {avatar && (
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3"
          >
            <Skeleton className={cn("h-3.5", LABEL_WIDTHS[index % LABEL_WIDTHS.length])} />
            <Skeleton className={cn("h-3.5", VALUE_WIDTHS[index % VALUE_WIDTHS.length])} />
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}
