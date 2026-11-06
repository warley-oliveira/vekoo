import { Skeleton } from "@/components/ui/skeleton"
import type { CalendarView } from "@/lib/calendar/calendar-view"

/** O miolo enquanto a grade carrega: as mesmas colunas e linhas, sem pular quando ela chega. */
export function CalendarGridSkeleton({ view }: { view: CalendarView }) {
  if (view === "agenda") return <AgendaSkeleton />

  if (view === "month") {
    return (
      <div aria-hidden className="grid h-full grid-cols-7 grid-rows-6 gap-px bg-border/50">
        {Array.from({ length: 42 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5 bg-background p-2">
            <Skeleton className="h-3 w-5" />
            {index % 5 === 1 ? <Skeleton className="h-4 w-4/5" /> : null}
          </div>
        ))}
      </div>
    )
  }

  const columns = view === "day" ? 1 : 7
  return (
    <div aria-hidden className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b py-2 pl-12">
        {Array.from({ length: columns }, (_, index) => (
          <div key={index} className="flex flex-1 justify-center">
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 flex-col gap-10 pt-3 pr-2 pl-2">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-full" />
          ))}
        </div>
        <div className="relative flex flex-1 border-l">
          {Array.from({ length: columns }, (_, index) => (
            <div key={index} className="relative flex-1 border-r border-border/50 last:border-r-0">
              {index % 2 === 0 ? (
                <Skeleton
                  className="absolute inset-x-1 h-16"
                  style={{ top: `${(index * 11) % 60 + 12}%` }}
                />
              ) : null}
              {index % 3 === 0 ? (
                <Skeleton
                  className="absolute inset-x-1 h-10"
                  style={{ top: `${(index * 7) % 30 + 55}%` }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgendaSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {[3, 2].map((rows, group) => (
        <div key={group}>
          <div className="flex items-center gap-2.5 border-b px-4 py-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
              <div className="w-12 space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-10 w-1" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** A tela toda, antes de saber quais calendários existem. */
export function CalendarPageSkeleton({ view, isPhone }: { view: CalendarView; isPhone: boolean }) {
  return (
    <div aria-hidden className="flex h-full min-h-0">
      <div className="hidden w-64 shrink-0 flex-col gap-5 border-r p-4 lg:flex">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, index) => (
            <Skeleton key={index} className="aspect-square rounded-md" />
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-5 w-32" />
        </div>
        {isPhone ? (
          <div className="grid grid-cols-7 gap-1 px-2 py-2">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="mx-auto size-9 rounded-full" />
            ))}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <CalendarGridSkeleton view={view} />
        </div>
      </div>
    </div>
  )
}
