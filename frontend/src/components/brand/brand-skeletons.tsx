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
    <div className="mx-auto max-w-[1180px] px-4 py-8 md:px-8 md:py-10" aria-busy>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[400px_1fr]">
        <Skeleton className="h-[34rem] w-full rounded-vk" />
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-vk" />
          <Skeleton className="h-64 rounded-vk" />
          <Skeleton className="h-40 rounded-vk" />
        </div>
      </div>
    </div>
  )
}
