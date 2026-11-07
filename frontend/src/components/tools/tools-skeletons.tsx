import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"

/** O esqueleto repete o cartão: ladrilho, nome e apoio, a frase e o botão. */
export function ToolGridSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="flex min-h-36 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="mt-auto ml-auto h-7 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  )
}

/** Grupo por origem, com as linhas de cada função. */
export function FunctionListSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      {[2, 4].map((rows) => (
        <div key={rows} className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5 py-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5 px-3 py-3">
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-40 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

/** Dados de um lado, código do outro. */
export function FunctionEditorSkeleton() {
  return (
    <LoadingRegion className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-[28rem] w-full rounded-lg" />
      </div>
    </LoadingRegion>
  )
}
