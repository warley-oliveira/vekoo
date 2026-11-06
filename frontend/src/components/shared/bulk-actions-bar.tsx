import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type BulkActionsBarProps = {
  /** Quantos itens estão selecionados. Com 0 a barra sai de cena. */
  count: number
  onClear: () => void
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
  children,
  selectAll,
  className,
}: BulkActionsBarProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()

  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          {...preset.slideUp}
          data-slot="bulk-actions-bar"
          // Acima da navegação inferior do celular, que publica a própria altura.
          className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom)+var(--mobile-nav-height,0px))] z-40 flex justify-center px-4"
        >
          <div
            role="toolbar"
            aria-label={t("kit.bulk.toolbar")}
            className={cn(
              "pointer-events-auto flex max-w-full items-center gap-2 rounded-xl bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10",
              className
            )}
          >
            <span role="status" className="font-medium whitespace-nowrap tabular-nums">
              {t("kit.bulk.selected", {
                count,
                formatted: formatNumber(count, language),
              })}
            </span>
            {selectAll && selectAll.total > count ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="hidden px-0 sm:inline-flex"
                onClick={selectAll.onSelect}
              >
                {t("kit.bulk.selectAll", {
                  count: selectAll.total,
                  formatted: formatNumber(selectAll.total, language),
                })}
              </Button>
            ) : null}
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">{children}</div>
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
