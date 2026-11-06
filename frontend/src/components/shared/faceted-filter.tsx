import { useId, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { useFilterLayout } from "./filter-layout-context"
import { ResponsivePopover } from "./responsive-popover"
import type { SelectOption } from "./select-field"

/** A partir deste número de opções a lista ganha busca própria. */
const SEARCH_THRESHOLD = 7
/** Quantos rótulos cabem no botão antes de virar "3 selecionados". */
const MAX_VISIBLE_LABELS = 2

export type FacetOption = SelectOption & {
  /** Quantos registros têm esse valor. */
  count?: number
}

export type FacetedFilterProps = {
  title: string
  options: FacetOption[]
  value: string[]
  onChange: (value: string[]) => void
  icon?: ReactNode
  className?: string
}

function toggle(value: string[], option: string) {
  return value.includes(option)
    ? value.filter((item) => item !== option)
    : [...value, option]
}

/**
 * Filtrar por uma ou mais opções de um campo: status, etiqueta, responsável. Em linha é
 * um botão com popover; dentro de `FilterBar` no celular ou `FilterPopover`, lista à vista.
 */
export function FacetedFilter({
  title,
  options,
  value,
  onChange,
  icon,
  className,
}: FacetedFilterProps) {
  const { t } = useTranslation()
  const layout = useFilterLayout()
  const titleId = useId()

  const selected = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value]
  )

  if (layout === "stacked") {
    return (
      <div role="group" aria-labelledby={titleId} className={cn("flex flex-col gap-1.5", className)}>
        <span id={titleId} className="text-sm font-medium">
          {title}
        </span>
        <FacetOptions title={title} options={options} value={value} onChange={onChange} />
      </div>
    )
  }

  return (
    <ResponsivePopover
      title={title}
      className="w-64 gap-0 overflow-hidden p-0"
      sheetClassName="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      trigger={
        <Button
          type="button"
          variant="outline"
          className={cn("max-w-full pointer-coarse:h-10", className)}
        >
          {icon}
          <span className="truncate">{title}</span>
          {selected.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-3.5 self-center" />
              {selected.length > MAX_VISIBLE_LABELS ? (
                <Badge variant="secondary" className="rounded-sm bg-accent px-1 text-accent-foreground">
                  {t("kit.filters.selected", { count: selected.length })}
                </Badge>
              ) : (
                selected.map((option) => (
                  <Badge
                    key={option.value}
                    variant="secondary"
                    className="max-w-28 rounded-sm bg-accent px-1 text-accent-foreground"
                  >
                    <span className="truncate">{option.label}</span>
                  </Badge>
                ))
              )}
            </>
          ) : null}
        </Button>
      }
    >
      <div role="group" aria-label={title} className="flex flex-col gap-1.5 md:p-2">
        <FacetOptions title={title} options={options} value={value} onChange={onChange} />
      </div>
      {value.length > 0 ? (
        <div className="border-t pt-1 md:p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full pointer-coarse:h-10"
            onClick={() => onChange([])}
          >
            {t("kit.filters.clearFilter")}
          </Button>
        </div>
      ) : null}
    </ResponsivePopover>
  )
}

/**
 * A lista em si: checkboxes de verdade, que o teclado alcança com Tab e marca com Espaço,
 * mesmo sem campo de busca. A busca ignora acento e caixa.
 */
function FacetOptions({
  title,
  options,
  value,
  onChange,
}: Pick<FacetedFilterProps, "title" | "options" | "value" | "onChange">) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [query, setQuery] = useState("")

  const visible = useMemo(
    () => (query ? options.filter((option) => matchesSearch(option.label, query)) : options),
    [options, query]
  )

  return (
    <>
      {options.length >= SEARCH_THRESHOLD ? (
        <Input
          aria-label={t("kit.filters.searchIn", { title })}
          placeholder={t("kit.filters.searchIn", { title })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {visible.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm hover:bg-muted/50 pointer-coarse:min-h-10",
              option.disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <Checkbox
              className="border-muted-foreground/40"
              checked={value.includes(option.value)}
              disabled={option.disabled}
              onCheckedChange={() => onChange(toggle(value, option.value))}
            />
            {option.icon}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.count !== undefined ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatNumber(option.count, language)}
              </span>
            ) : null}
          </label>
        ))}
        {visible.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("kit.filters.noOptions")}</p>
        ) : null}
      </div>
    </>
  )
}
