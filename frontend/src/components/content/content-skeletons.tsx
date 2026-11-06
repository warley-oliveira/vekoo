import { LoadingRegion, SectionCard } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"

// Enquanto a lista não chega: o mesmo desenho das linhas e dos cards desta área, para nada
// pular de lugar quando os dados entram.

const TITLE_WIDTHS = ["w-1/3", "w-1/4", "w-2/5", "w-1/4", "w-1/3", "w-2/5"]
const LINE_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-3/5", "w-2/3", "w-3/4"]

function RowLines({ index }: { index: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
      <Skeleton className={`h-3.5 ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}`} />
      <Skeleton className={`h-3 ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
    </div>
  )
}

/** A linha de uma mensagem rápida: o atalho, e o nome com o texto ao lado. */
export function QuickReplyListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SectionCard contentClassName="px-1.5 md:px-2">
      <LoadingRegion className="flex flex-col divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5 px-2 py-2.5 md:flex-row md:gap-4">
            <div className="shrink-0 md:w-36">
              <Skeleton className="h-5 w-20" />
            </div>
            <RowLines index={index} />
          </div>
        ))}
      </LoadingRegion>
    </SectionCard>
  )
}

/** A linha de um campo personalizado: o ícone do tipo, o nome e os detalhes. */
export function CustomFieldListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SectionCard contentClassName="px-1.5 md:px-2">
      <LoadingRegion className="flex flex-col divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-start gap-3 px-2 py-2.5">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <RowLines index={index} />
          </div>
        ))}
      </LoadingRegion>
    </SectionCard>
  )
}

/** A linha de um anexo na lista: a miniatura, o nome e a descrição. */
export function AttachmentListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SectionCard contentClassName="px-1.5 md:px-2">
      <LoadingRegion className="flex flex-col divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <RowLines index={index} />
          </div>
        ))}
      </LoadingRegion>
    </SectionCard>
  )
}

/** O card de um anexo: a miniatura encostada nas bordas, e o texto embaixo. */
export function AttachmentGridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <LoadingRegion className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className={`h-3.5 ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}`} />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}
