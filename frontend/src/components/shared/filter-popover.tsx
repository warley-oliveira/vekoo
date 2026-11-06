import { useState, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ListFilter } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FilterLayoutContext } from "./filter-layout-context"
import { ResponsivePopover } from "./responsive-popover"

export type FilterPopoverProps = {
  children: ReactNode
  /** Quantos filtros estão ativos; aparece no botão. */
  activeCount?: number
  /** Mostra "Limpar filtros" no rodapé. */
  onClear?: () => void
  /** Texto do botão. Padrão: "Filtros". */
  label?: string
  align?: ComponentProps<typeof ResponsivePopover>["align"]
  /** Mostra só o ícone, para espaços apertados. */
  iconOnly?: boolean
  className?: string
}

/**
 * Vários filtros atrás de um botão só, com a contagem de ativos. Vira Sheet no celular.
 * Os filtros dentro dele se desenham empilhados sozinhos.
 */
export function FilterPopover({
  children,
  activeCount = 0,
  onClear,
  label,
  align = "start",
  iconOnly = false,
  className,
}: FilterPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const text = label ?? t("kit.filters.title")

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={text}
      align={align}
      className="w-80 gap-0 p-0"
      sheetClassName="px-0 pb-0"
      trigger={
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? "icon-sm" : "sm"}
          aria-label={iconOnly ? t("kit.filters.withCount", { count: activeCount }) : undefined}
          className={cn("relative pointer-coarse:h-10", iconOnly && "pointer-coarse:w-10", className)}
        >
          <ListFilter />
          {iconOnly ? null : text}
          {activeCount > 0 ? (
            iconOnly ? (
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
            ) : (
              <Badge className="h-4.5 min-w-4.5 rounded-full px-1 tabular-nums">
                {activeCount}
              </Badge>
            )
          ) : null}
        </Button>
      }
    >
      <FilterLayoutContext.Provider value="stacked">
        <div className="flex max-h-[min(60dvh,28rem)] flex-col gap-4 overflow-y-auto px-4 py-3 md:p-3">
          {children}
        </div>
      </FilterLayoutContext.Provider>
      <div className="flex items-center justify-between gap-2 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-3 md:pb-2">
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={activeCount === 0}
            onClick={onClear}
            className="pointer-coarse:h-10"
          >
            {t("kit.filters.clear")}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(false)}
          className="pointer-coarse:h-10"
        >
          {t("kit.filters.done")}
        </Button>
      </div>
    </ResponsivePopover>
  )
}
