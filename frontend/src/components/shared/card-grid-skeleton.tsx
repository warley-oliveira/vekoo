import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { LoadingRegion } from "./loading-region"

export type CardGridSkeletonProps = {
  cards?: number
  /** Área de imagem no topo de cada card. */
  media?: boolean
  className?: string
}

/** Grade de cards carregando: catálogo, integrações, fluxos. */
export function CardGridSkeleton({
  cards = 6,
  media = false,
  className,
}: CardGridSkeletonProps) {
  return (
    <LoadingRegion
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
        >
          {media && <Skeleton className="aspect-video w-full rounded-lg" />}
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </LoadingRegion>
  )
}
