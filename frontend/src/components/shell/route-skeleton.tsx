import { Skeleton } from "@/components/ui/skeleton"

/**
 * Enquanto o chunk da rota chega. Espelha a página típica da plataforma: faixa de
 * filtros, indicadores e lista. Só aparece depois de 150 ms: num chunk rápido, nenhum
 * esqueleto pisca na tela.
 */
export function RouteSkeleton() {
  return (
    <div
      aria-hidden
      className="mr-auto max-w-6xl animate-in px-4 py-6 delay-150 duration-200 fade-in fill-mode-both md:px-6"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-56 max-w-[60%]" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="space-y-2.5 rounded-xl border p-4">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
