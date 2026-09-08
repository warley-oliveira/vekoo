import { Skeleton } from "@/components/ui/skeleton"

/** Espelha o layout do formulário: cabeçalho, trilha, campos e cartão. */
export function BrandWizardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6" aria-busy>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className="mt-5 h-1 w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_19rem]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
        <div className="hidden xl:block">
          <Skeleton className="aspect-[3/4] w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

/** A página da marca: cartão à esquerda, estado e histórico à direita. */
export function BrandOverviewSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6" aria-busy>
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Skeleton className="aspect-[3/4] w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  )
}
