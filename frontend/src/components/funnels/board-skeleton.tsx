import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsMobile } from "@/hooks/use-is-mobile"

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

function ColumnSkeleton({ cards }: { cards: number }) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-muted/50 p-2 md:w-72 md:shrink-0">
      <div className="flex flex-col gap-1.5 px-1 pt-1 pb-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
      </div>
      {Array.from({ length: cards }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  )
}

/** Espelha o quadro: quatro colunas no desktop, e as etapas em cima de uma coluna só no celular. */
export function BoardSkeleton() {
  const isMobile = useIsMobile()

  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {isMobile ? (
        <>
          <div className="flex gap-1.5 overflow-hidden">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-10 w-28 shrink-0 rounded-lg" />
            ))}
          </div>
          <ColumnSkeleton cards={4} />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          <ColumnSkeleton cards={3} />
          <ColumnSkeleton cards={4} />
          <ColumnSkeleton cards={2} />
          <ColumnSkeleton cards={3} />
        </div>
      )}
    </LoadingRegion>
  )
}
