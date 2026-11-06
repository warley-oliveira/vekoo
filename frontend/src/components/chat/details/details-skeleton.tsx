import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"

/** O painel carregando: o contato, as linhas de atribuição e as seções, como vão aparecer. */
export function DetailsSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <LoadingRegion className="flex h-full min-h-0 flex-col overflow-hidden">
      {withHeader ? (
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
          <Skeleton className="h-8 flex-1 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      ) : null}

      <div className="flex items-start gap-3 px-4 py-4">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t px-4 py-3">
        {["w-2/5", "w-1/2", "w-1/4"].map((width) => (
          <div key={width} className="grid h-7 grid-cols-[6.25rem_minmax(0,1fr)] items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className={`h-3 ${width}`} />
          </div>
        ))}
      </div>

      {["w-16", "w-12", "w-24"].map((width) => (
        <div key={width} className="flex flex-col gap-2 border-t px-4 py-3">
          <Skeleton className={`h-3 ${width}`} />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </LoadingRegion>
  )
}
