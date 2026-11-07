import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { WIDGET_CATEGORIES, WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { adaptToType, type EditorValues } from "@/lib/custom-dashboards/editor-model"
import type { DataSourceMeta, WidgetType } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { WIDGET_TYPE_ICONS } from "../icons"

const DATA_TYPES: WidgetType[] = WIDGET_CATEGORIES.flatMap((category) => category.types).filter(
  (type) => WIDGET_SPECS[type].needsData
)

/** A forma do card, a um clique: a prévia troca junto, e testar outra não custa nada. */
export function TypePicker({ sources }: { sources: DataSourceMeta[] }) {
  const { t } = useTranslation()
  const form = useFormContext<EditorValues>()
  const widgetType = useWatch({ control: form.control, name: "widgetType" })

  function change(type: WidgetType) {
    if (type === widgetType) return
    const values = form.getValues()
    const source = sources.find((item) => item.key === values.dataSource)
    form.reset(adaptToType(values, type, source), { keepDefaultValues: true })
    form.setValue("widgetType", type, { shouldDirty: true })
  }

  return (
    <div role="radiogroup" aria-label={t("customDashboards.editor.type")} className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{t("customDashboards.editor.type")}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1.5">
        {DATA_TYPES.map((type) => {
          const Icon = WIDGET_TYPE_ICONS[type]
          const selected = type === widgetType
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              title={t(`customDashboards.types.${type}.description`)}
              onClick={() => change(type)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center text-xs leading-tight ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                selected && "bg-primary/5 font-medium text-primary ring-2 ring-primary"
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {t(`customDashboards.types.${type}.short`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
