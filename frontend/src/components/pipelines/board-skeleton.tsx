import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"

const COLUMN_CARDS = [3, 2, 4, 1, 2]

/** O quadro carregando: as mesmas colunas e os mesmos cards, sem spinner solto. */
export function BoardSkeleton() {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-label={t("pipelines.loading")}
      className="flex min-h-0 flex-1 items-start gap-3 overflow-hidden px-4 pb-3 md:px-6"
    >
      {COLUMN_CARDS.map((cards, column) => (
        <div
          key={column}
          className="flex w-[calc(100vw-2rem)] shrink-0 flex-col gap-2 rounded-2xl bg-muted/50 p-2 md:w-72"
        >
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          {Array.from({ length: cards }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/5">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="size-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
