import { memo } from "react"
import { useTranslation } from "react-i18next"

import { TagChip } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatViews } from "@/hooks/chat/use-chat-refs"
import { useFilterFields } from "@/hooks/chat/use-filter-fields"
import { isCompleteCondition } from "@/lib/chat/filters"
import { useListFilters } from "@/lib/chat/stores"

/** O que está filtrando a lista, à vista, com um X em cada. Só existe se houver filtro. */
export const ActiveFilters = memo(function ActiveFilters() {
  const hasFilters = useListFilters((state) => state.conditions.some(isCompleteCondition))
  return hasFilters ? <ActiveFiltersContent /> : null
})

function ActiveFiltersContent() {
  const { t } = useTranslation()
  const conditions = useListFilters((state) => state.conditions)
  const activeViewId = useListFilters((state) => state.activeViewId)
  const setConditions = useListFilters((state) => state.setConditions)
  const { describe } = useFilterFields()
  const { views } = useChatViews()

  const view = views.find((item) => item.id === activeViewId)

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
      {view ? (
        <span className="mr-1 max-w-full truncate text-xs font-medium">{view.name}</span>
      ) : null}
      {conditions.map((condition, index) =>
        isCompleteCondition(condition) ? (
          <TagChip
            key={`${condition.attributeKey}-${index}`}
            className="max-w-full"
            onRemove={() =>
              setConditions(conditions.filter((_, position) => position !== index))
            }
            removeLabel={t("chat.filters.removeOne", { filter: describe(condition) })}
          >
            {describe(condition)}
          </TagChip>
        ) : null
      )}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={() => setConditions([])}
      >
        {t("chat.filters.clear")}
      </Button>
    </div>
  )
}
