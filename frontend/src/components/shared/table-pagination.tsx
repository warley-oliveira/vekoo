import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { SelectInput } from "./select-field"

export const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export type TablePaginationProps = {
  page: number
  totalPages: number
  total: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
  perPageOptions?: number[]
  /** À esquerda, junto da contagem. */
  extra?: ReactNode
  className?: string
}

/** Rodapé paginado. Já vem no `DataTable`; sozinho, serve a listas e grades paginadas. */
export function TablePagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  extra,
  className,
}: TablePaginationProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const options = perPageOptions.includes(perPage)
    ? perPageOptions
    : [...perPageOptions, perPage].sort((a, b) => a - b)
  const multiplePages = totalPages > 1

  return (
    <div
      data-slot="table-pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span aria-live="polite" className="tabular-nums">
          {t("kit.table.range", {
            from: formatNumber(from, language),
            to: formatNumber(to, language),
            total: formatNumber(total, language),
          })}
        </span>
        {extra}
      </div>

      <div className="flex items-center gap-3">
        {onPerPageChange && total > options[0] ? (
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">{t("kit.table.perPage")}</span>
            <SelectInput
              aria-label={t("kit.table.perPage")}
              size="sm"
              className="w-18 text-xs"
              options={options.map((option) => ({
                value: String(option),
                label: formatNumber(option, language),
              }))}
              value={String(perPage)}
              onChange={(next) => {
                if (next) onPerPageChange(Number(next))
              }}
            />
          </div>
        ) : null}

        {multiplePages ? (
          <nav aria-label={t("kit.table.pagination")} className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("kit.table.previous")}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="px-1 whitespace-nowrap tabular-nums">
              {t("kit.table.pageOf", {
                page: formatNumber(page, language),
                total: formatNumber(totalPages, language),
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("kit.table.next")}
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight />
            </Button>
          </nav>
        ) : null}
      </div>
    </div>
  )
}
