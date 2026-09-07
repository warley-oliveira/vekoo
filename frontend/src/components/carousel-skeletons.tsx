import { Skeleton } from "@/components/ui/skeleton"

// Esqueletos que espelham o layout final — não um spinner no meio da tela.
// A diferença importa: com a moldura já no lugar, o conteúdo entra sem empurrar
// nada, e quem está olhando entende o que está chegando.

/** A grade da biblioteca: capa 4:5, título e a linha de metadados. */
export function CarouselGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4"
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          {/* Cantos retos: capa de carrossel não é arredondada (o Instagram
              não arredonda imagem), e o esqueleto tem que mentir o menos
              possível sobre o que vem. */}
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}

/** A tabela: cabeçalho mais linhas com miniatura. */
export function CarouselTableSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" aria-hidden>
      <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
          <Skeleton className="h-10 w-8 shrink-0 rounded-none" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

/** A lixeira: miniatura, título e o aviso de quantos dias faltam. */
export function TrashListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="divide-y rounded-lg border" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-14 w-11 shrink-0 rounded-none" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="size-8 rounded-md" />
        </li>
      ))}
    </ul>
  )
}

/** As pastas da barra lateral. */
export function FolderListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-0.5 px-1" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-3 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
  )
}
