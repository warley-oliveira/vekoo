import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Settings2 } from "lucide-react"

import { ResponsivePopover, useFilterLayout } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { categoryPathLabel, subtreeItemCount } from "@/lib/products/category-tree"
import type { ProductCategory } from "@/lib/products/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

/** A partir daqui a lista ganha busca própria, como no `FacetedFilter`. */
const SEARCH_THRESHOLD = 7
const MAX_VISIBLE_LABELS = 2
const INDENT_PX = 14

type CategoryFilterProps = {
  categories: readonly ProductCategory[]
  /** Caminhos selecionados: o filtro da API usa o caminho, e vale a subárvore. */
  value: string[]
  onChange: (paths: string[]) => void
}

/**
 * Como o `FacetedFilter`, mas em árvore, e com o caminho para gerenciar as categorias ao
 * alcance: é aqui que a pessoa pensa em categoria e nota que falta uma.
 */
export function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
  const { t } = useTranslation()
  const layout = useFilterLayout()
  const titleId = useId()
  const title = t("products.list.filters.category")

  const selected = useMemo(
    () => categories.filter((category) => value.includes(category.path)),
    [categories, value]
  )

  if (layout === "stacked") {
    return (
      <div role="group" aria-labelledby={titleId} className="flex flex-col gap-1.5">
        <span id={titleId} className="text-sm font-medium">
          {title}
        </span>
        <CategoryOptions categories={categories} value={value} onChange={onChange} />
        <ManageLink />
      </div>
    )
  }

  return (
    <ResponsivePopover
      title={title}
      className="w-72 gap-0 overflow-hidden p-0"
      sheetClassName="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      trigger={
        <Button type="button" variant="outline" className="max-w-full pointer-coarse:h-10">
          <span className="truncate">{title}</span>
          {selected.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-3.5 self-center" />
              {selected.length > MAX_VISIBLE_LABELS ? (
                <Badge variant="secondary" className="rounded-sm bg-accent px-1 text-accent-foreground">
                  {t("kit.filters.selected", { count: selected.length })}
                </Badge>
              ) : (
                selected.map((category) => (
                  <Badge
                    key={category.id}
                    variant="secondary"
                    className="max-w-28 rounded-sm bg-accent px-1 text-accent-foreground"
                  >
                    <span className="truncate">{category.name}</span>
                  </Badge>
                ))
              )}
            </>
          ) : null}
        </Button>
      }
    >
      <div role="group" aria-label={title} className="flex flex-col gap-1.5 md:p-2">
        <CategoryOptions categories={categories} value={value} onChange={onChange} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-1 md:p-1">
        <ManageLink />
        {value.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-10"
            onClick={() => onChange([])}
          >
            {t("kit.filters.clearFilter")}
          </Button>
        ) : null}
      </div>
    </ResponsivePopover>
  )
}

function ManageLink() {
  const { t } = useTranslation()

  return (
    <Button
      nativeButton={false}
      variant="ghost"
      size="sm"
      className="justify-start text-muted-foreground pointer-coarse:h-10"
      render={<Link to="/catalog/categories" />}
    >
      <Settings2 />
      {t("products.list.filters.manageCategories")}
    </Button>
  )
}

function CategoryOptions({ categories, value, onChange }: CategoryFilterProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [query, setQuery] = useState("")

  const visible = useMemo(
    () =>
      query
        ? categories.filter((category) =>
            matchesSearch(categoryPathLabel(categories, category), query)
          )
        : categories,
    [categories, query]
  )

  function toggle(path: string) {
    onChange(value.includes(path) ? value.filter((item) => item !== path) : [...value, path])
  }

  return (
    <>
      {categories.length >= SEARCH_THRESHOLD ? (
        <Input
          aria-label={t("kit.filters.searchIn", { title: t("products.list.filters.category") })}
          placeholder={t("kit.filters.searchIn", { title: t("products.list.filters.category") })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {visible.map((category) => {
          const count = subtreeItemCount(categories, category)
          return (
            <label
              key={category.id}
              // Buscando, o recuo não diz nada: quem diz é o caminho inteiro.
              style={query ? undefined : { paddingInlineStart: category.depth * INDENT_PX + 4 }}
              className={cn(
                "flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md py-1 pr-1 text-sm hover:bg-muted/50 pointer-coarse:min-h-10",
                query && "pl-1"
              )}
            >
              <Checkbox
                className="border-muted-foreground/40"
                checked={value.includes(category.path)}
                onCheckedChange={() => toggle(category.path)}
              />
              <span className="min-w-0 flex-1 truncate">
                {query ? categoryPathLabel(categories, category) : category.name}
              </span>
              {count > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(count, language)}
                </span>
              ) : null}
            </label>
          )
        })}
        {visible.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {categories.length === 0
              ? t("products.list.filters.noCategories")
              : t("kit.filters.noOptions")}
          </p>
        ) : null}
      </div>
    </>
  )
}
