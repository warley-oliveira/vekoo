import { LoadingRegion } from "@/components/shared"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function FieldSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className={tall ? "h-20 w-full" : "h-8 w-full"} />
    </div>
  )
}

function SectionSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

/** A mesma disposição do formulário do item: duas colunas no desktop, uma no celular. */
export function ItemPageSkeleton() {
  return (
    <LoadingRegion className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
        <SectionSkeleton>
          <FieldSkeleton />
          <FieldSkeleton tall />
          <FieldSkeleton tall />
        </SectionSkeleton>
        <SectionSkeleton>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3 lg:grid-cols-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </SectionSkeleton>
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
        <SectionSkeleton>
          <Skeleton className="h-5 w-full" />
          <FieldSkeleton />
          <FieldSkeleton />
        </SectionSkeleton>
        <SectionSkeleton>
          <FieldSkeleton />
          <FieldSkeleton />
        </SectionSkeleton>
      </div>
    </LoadingRegion>
  )
}
