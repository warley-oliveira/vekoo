import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import { FilterPopover } from "./filter-popover"
import { SearchInput, type SearchInputProps } from "./search-input"

export type FilterBarProps = {
  /** Campo de busca. Passe `value` e `onChange`, e o resto de `SearchInput` se quiser. */
  search?: SearchInputProps
  /** `FacetedFilter`, `DateRangePicker`... No celular vão para uma Sheet, empilhados. */
  filters?: ReactNode
  /** `SortMenu`. */
  sort?: ReactNode
  /** Quantos filtros estão ativos, sem contar a busca. */
  activeCount?: number
  /** Limpa filtros e busca. O botão aparece quando há o que limpar. */
  onClear?: () => void
  /** Total encontrado, à direita: "128 contatos". */
  resultLabel?: ReactNode
  /** Botões ao lado da ordenação. */
  actions?: ReactNode
  className?: string
}

/**
 * A linha acima de toda coleção: busca, filtros, ordenação e limpar. Se adapta sozinha
 * ao celular. A tela guarda o estado e aplica os filtros; esta barra só os organiza.
 */
export function FilterBar({
  search,
  filters,
  sort,
  activeCount = 0,
  onClear,
  resultLabel,
  actions,
  className,
}: FilterBarProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const canClear = activeCount > 0 || Boolean(search?.value)

  if (isMobile) {
    return (
      <div data-slot="filter-bar" className={cn("flex flex-col gap-2", className)}>
        {search ? <SearchInput {...search} shortcut={false} /> : null}
        {filters || sort || actions ? (
          <div className="flex flex-wrap items-center gap-2">
            {filters ? (
              <FilterPopover activeCount={activeCount} onClear={onClear}>
                {filters}
              </FilterPopover>
            ) : null}
            {sort}
            {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {resultLabel ? (
          <p className="text-xs text-muted-foreground tabular-nums">{resultLabel}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-slot="filter-bar"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {search ? <SearchInput {...search} className={cn("w-64", search.className)} /> : null}
      {filters}
      {onClear && canClear ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onClear}
        >
          <X />
          {t("kit.filters.clear")}
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {resultLabel ? (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {resultLabel}
          </span>
        ) : null}
        {sort}
        {actions}
      </div>
    </div>
  )
}
