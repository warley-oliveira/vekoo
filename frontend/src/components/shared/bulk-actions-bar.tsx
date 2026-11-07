import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

/** O que `t()` precisa para o plural: `count` escolhe a forma, `formatted` é o número escrito. */
export type BulkLabelAmount = { count: number; formatted: string }

export type BulkActionsBarProps = {
  /** Quantos itens estão selecionados. Com 0 a barra sai de cena. */
  count: number
  onClear: () => void
  /**
   * O que está selecionado, com gênero e plural de quem sabe o que é:
   * `(amount) => t("campaigns.bulk.selected", amount)`, "3 campanhas selecionadas".
   * Sem ele, "3 itens selecionados".
   */
  label?: (amount: BulkLabelAmount) => string
  /** Botões das ações, tamanho `sm`. */
  children: ReactNode
  /** Oferece estender a seleção a todos os resultados, além da página. */
  selectAll?: {
    total: number
    onSelect: () => void
  }
  className?: string
}

/**
 * Ações sobre os selecionados, flutuando embaixo: continua à vista enquanto a pessoa
 * rola a lista. O `DataTable` já traz esta barra pela prop `bulkActions`.
 */
export function BulkActionsBar({
  count,
  onClear,
  label,
  children,
  selectAll,
  className,
}: BulkActionsBarProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const amount: BulkLabelAmount = { count, formatted: formatNumber(count, language) }

  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          {...preset.slideUp}
          data-slot="bulk-actions-bar"
          // Acima da navegação inferior do celular, que publica a própria altura.
          className="pointer-events-none fixed inset-x-0 bottom-[calc(max(var(--app-bottom-nav-total),var(--app-safe-bottom))+1rem)] z-40 flex justify-center px-4"
        >
          <div
            role="toolbar"
            aria-label={t("kit.bulk.toolbar")}
            // Em tela estreita, duas linhas: quantos e o fechar em cima, as ações embaixo. Nenhum
            // rótulo some atrás de uma rolagem que ninguém descobre.
            className={cn(
              "pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 sm:flex-nowrap",
              className
            )}
          >
            <span
              role="status"
              className="min-w-0 flex-1 font-medium tabular-nums sm:flex-none sm:whitespace-nowrap"
            >
              {label ? label(amount) : t("kit.bulk.selected", amount)}
            </span>
            {selectAll && selectAll.total > count ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="order-1 w-full justify-start px-0 sm:order-none sm:w-auto"
                onClick={selectAll.onSelect}
              >
                {t("kit.bulk.selectAll", {
                  count: selectAll.total,
                  formatted: formatNumber(selectAll.total, language),
                })}
              </Button>
            ) : null}
            <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border sm:block" />
            <div className="order-2 -ml-1.5 flex w-full min-w-0 flex-wrap items-center gap-1 sm:order-none sm:ml-0 sm:w-auto">
              {children}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("kit.bulk.clear")}
              className="shrink-0 text-muted-foreground"
              onClick={onClear}
            >
              <X />
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
