import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { LoadingRegion } from "./loading-region"

const CELL_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"]

export type TableSkeletonProps = {
  rows?: number
  columns?: number
  className?: string
}

/** Tabela carregando, fora do `DataTable` (que já traz o próprio esqueleto). */
export function TableSkeleton({ rows = 8, columns = 4, className }: TableSkeletonProps) {
  const template = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }

  return (
    <LoadingRegion className={cn("overflow-hidden rounded-lg border", className)}>
      <div className="grid gap-4 border-b px-3 py-3" style={template}>
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} className="h-3 w-1/3" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid gap-4 border-b px-3 py-3.5 last:border-b-0"
          style={template}
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn("h-3.5", CELL_WIDTHS[(row + column) % CELL_WIDTHS.length])}
            />
          ))}
        </div>
      ))}
    </LoadingRegion>
  )
}
