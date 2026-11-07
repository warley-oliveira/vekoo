import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Plus, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { DetailSkeleton, EmptyState, ErrorState, SearchInput, SegmentedControl, ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useDataSources } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { useOpenCount } from "@/hooks/use-panel-session"
import { MAX_WIDGETS, WIDGET_CATEGORIES } from "@/lib/custom-dashboards/catalog"
import { matchesSearch } from "@/lib/search-text"
import {
  instantiateRecipe,
  RECIPE_CATEGORIES,
  RECIPES,
  recipeAvailable,
  type Recipe,
} from "@/lib/custom-dashboards/templates"
import type { DashboardWidget, WidgetType } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { WIDGET_TYPE_ICONS } from "./icons"

type WidgetLibraryProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  widgetCount: number
  /** Um card pronto, na hora. */
  onAdd: (widget: Omit<DashboardWidget, "position">) => void
  /** Abrir o editor com um card pronto, para ajustar antes de entrar. */
  onCustomize: (recipe: Recipe) => void
  /** Abrir o editor do zero, num tipo. */
  onStartBlank: (type: WidgetType) => void
}

/**
 * De onde saem os cards: prontos, para quem só quer o número, ou do zero, por tipo. O painel fica aberto ao adicionar um
 * pronto: montar um painel é pegar vários, e cada volta ao botão seria um clique a mais.
 */
export function WidgetLibrary(props: WidgetLibraryProps) {
  // Cada abertura começa de novo, em "Prontos" e sem a busca da vez anterior.
  const openCount = useOpenCount(props.open)
  return <LibraryPanel key={openCount} {...props} />
}

function LibraryPanel({ open, onOpenChange, widgetCount, onAdd, onCustomize, onStartBlank }: WidgetLibraryProps) {
  const { t } = useTranslation()
  const { dataSources, error, reload } = useDataSources()
  const [mode, setMode] = useState<"recipes" | "blank">("recipes")
  const [query, setQuery] = useState("")
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const full = widgetCount >= MAX_WIDGETS

  const groups = useMemo(() => {
    if (!dataSources) return []
    const visible = RECIPES.filter(
      (recipe) =>
        recipeAvailable(recipe, dataSources) &&
        (!query.trim() ||
          matchesSearch(t(`customDashboards.library.items.${recipe.id}.title`), query) ||
          matchesSearch(t(`customDashboards.library.items.${recipe.id}.description`), query))
    )
    return RECIPE_CATEGORIES.map((category) => ({
      category,
      recipes: visible.filter((recipe) => recipe.category === category),
    })).filter((group) => group.recipes.length > 0)
  }, [dataSources, query, t])

  function addRecipe(recipe: Recipe) {
    onAdd(instantiateRecipe(recipe, t))
    setJustAdded(recipe.id)
    toast.success(t("customDashboards.library.added", { title: t(`customDashboards.library.items.${recipe.id}.title`) }))
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("customDashboards.library.title")}
      description={t("customDashboards.library.description")}
      size="2xl"
      fixedHeight
    >
      {error && !dataSources ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : !dataSources ? (
        <DetailSkeleton rows={6} />
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            aria-label={t("customDashboards.library.mode")}
            fullWidth
            value={mode}
            onChange={setMode}
            options={[
              { value: "recipes", label: t("customDashboards.library.recipes") },
              { value: "blank", label: t("customDashboards.library.blank") },
            ]}
          />

          {full ? <p className="text-sm text-muted-foreground">{t("customDashboards.library.full", { max: MAX_WIDGETS })}</p> : null}

          {mode === "recipes" ? (
            <>
              <SearchInput value={query} onChange={setQuery} debounce={0} shortcut={false} placeholder={t("customDashboards.library.search")} />
              {groups.length === 0 ? (
                <EmptyState
                  title={t("customDashboards.library.noResults")}
                  description={t("customDashboards.library.noResultsHint")}
                  action={{ label: t("customDashboards.library.blank"), onClick: () => setMode("blank") }}
                />
              ) : (
                groups.map(({ category, recipes }) => (
                  <section key={category} className="flex flex-col gap-1">
                    <h3 className="text-xs font-medium text-muted-foreground">{t(`customDashboards.library.categories.${category}`)}</h3>
                    <ul className="flex flex-col">
                      {recipes.map((recipe) => {
                        const Icon = WIDGET_TYPE_ICONS[recipe.widgetType]
                        return (
                          <li key={recipe.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{t(`customDashboards.library.items.${recipe.id}.title`)}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {t(`customDashboards.library.items.${recipe.id}.description`)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("customDashboards.library.customizeLabel", { title: t(`customDashboards.library.items.${recipe.id}.title`) })}
                              title={t("customDashboards.library.customize")}
                              className="shrink-0 text-muted-foreground"
                              disabled={full}
                              onClick={() => onCustomize(recipe)}
                            >
                              <SlidersHorizontal />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 pointer-coarse:h-10"
                              disabled={full}
                              aria-label={t("customDashboards.library.addLabel", { title: t(`customDashboards.library.items.${recipe.id}.title`) })}
                              onClick={() => addRecipe(recipe)}
                            >
                              {justAdded === recipe.id ? <Check /> : <Plus />}
                              {t("customDashboards.library.add")}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))
              )}
            </>
          ) : (
            WIDGET_CATEGORIES.map((category) => (
              <section key={category.id} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t(`customDashboards.types.categories.${category.id}`)}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {category.types.map((type) => {
                    const Icon = WIDGET_TYPE_ICONS[type]
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={full}
                        onClick={() => onStartBlank(type)}
                        className={cn(
                          "flex items-start gap-3 rounded-lg p-3 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                          full && "pointer-events-none opacity-50"
                        )}
                      >
                        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{t(`customDashboards.types.${type}.name`)}</span>
                          <span className="block text-xs text-pretty text-muted-foreground">{t(`customDashboards.types.${type}.description`)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </ResponsiveDialog>
  )
}
