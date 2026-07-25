import { LayoutTemplate, Palette } from "lucide-react"

import { EmptyState } from "@/components/empty-state"

// Modelos e Marcas fazem parte da navegação desde já, mas o conteúdo delas
// chega nas próximas etapas — sem UI de mentira enquanto isso.

export function TemplatesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <EmptyState
        icon={<LayoutTemplate className="size-6" />}
        title="Modelos estão chegando"
        description="Estruturas prontas de carrossel — lista, passo a passo, antes e depois — para você começar com meio caminho andado."
      />
    </div>
  )
}

export function BrandsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <EmptyState
        icon={<Palette className="size-6" />}
        title="Marcas estão chegando"
        description="Salve logo, cores e fontes uma vez e todo carrossel já sai com a sua cara."
      />
    </div>
  )
}
