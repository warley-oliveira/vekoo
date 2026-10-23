import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { useCreateBrand } from "@/hooks/use-create-brand"
import { cn } from "@/lib/utils"

/**
 * "Nova marca" ao lado do seletor, no topo. Fora do menu de propósito: a
 * primeira coisa que alguém faz no produto não pode estar a dois cliques.
 * Texto mono, sem borda, como o resto do chrome. Em tela estreita fica só o
 * "+" — o rótulo continua no `aria-label`, e o alvo nunca encolhe abaixo de 40px.
 */
export function NewBrandButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { create, creating } = useCreateBrand()
  const label = t("brandSwitcher.newBrand")

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 font-mono text-xs text-vk-muted outline-none transition-colors",
        "enabled:hover:text-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30 disabled:opacity-50",
        className
      )}
      onClick={() => void create()}
      disabled={creating}
      aria-label={label}
    >
      {creating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span aria-hidden>+</span>}
      <span className="hidden lowercase sm:inline">{label}</span>
    </button>
  )
}
