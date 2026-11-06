import { Skeleton } from "@/components/ui/skeleton"
import { LoadingRegion } from "./loading-region"
import { PageBody, type PageBodyProps } from "./page-body"
import { TableSkeleton } from "./table-skeleton"

export type PageSkeletonProps = {
  variant?: PageBodyProps["variant"]
  /** O que ocupa o corpo da página. Sem ele, uma tabela. */
  children?: React.ReactNode
}

/** A página inteira carregando: título, ações e corpo. Serve de fallback de rota lazy. */
export function PageSkeleton({ variant, children }: PageSkeletonProps) {
  return (
    <PageBody variant={variant}>
      <LoadingRegion className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
      </LoadingRegion>
      {children ?? <TableSkeleton />}
    </PageBody>
  )
}
