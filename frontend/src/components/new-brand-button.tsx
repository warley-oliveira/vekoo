import { useTranslation } from "react-i18next"
import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCreateBrand } from "@/hooks/use-create-brand"
import { cn } from "@/lib/utils"

/**
 * "Nova marca" ao lado do seletor, no topo. Fora do menu de propósito: a
 * primeira coisa que alguém faz no produto não pode estar a dois cliques.
 * Em tela estreita fica só o ícone — o rótulo continua no `aria-label`, e o
 * alvo nunca encolhe abaixo de 40px.
 */
export function NewBrandButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { create, creating } = useCreateBrand()
  const label = t("brandSwitcher.newBrand")

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-10 shrink-0 gap-1.5 px-2.5 sm:h-9 sm:px-3", className)}
      onClick={() => void create()}
      disabled={creating}
      aria-label={label}
    >
      {creating ? <Loader2 className="animate-spin" /> : <Plus />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  )
}
