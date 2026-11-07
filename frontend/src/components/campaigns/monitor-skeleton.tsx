import { LoadingRegion, PageBody, TableSkeleton } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"

const NUMBER_CELLS = 6
const ASIDE_ROWS = 5

/** O monitor carregando, com as mesmas áreas: veredito, barra, números, lista e história. */
export function MonitorSkeleton() {
  return (
    <PageBody variant="wide">
      <LoadingRegion className="flex flex-col gap-6 md:gap-8">
        <div className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10 md:p-6">
          <div className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full md:size-10" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-56 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-14 shrink-0" />
            <Skeleton className="h-2 flex-1 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: NUMBER_CELLS }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5 px-2 py-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-full max-w-md" />
            <TableSkeleton rows={8} columns={4} />
          </div>
          <div className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: ASIDE_ROWS }, (_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </LoadingRegion>
    </PageBody>
  )
}
