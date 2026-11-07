import { useId, type ComponentProps } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { SegmentedControl, SwitchField, TextField } from "@/components/shared"
import { Slider } from "@/components/ui/slider"
import { WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import type { EditorMetric, EditorValues } from "@/lib/custom-dashboards/editor-model"
import { metricKeys } from "@/lib/custom-dashboards/query"
import { cn } from "@/lib/utils"

import { WIDGET_ICON_KEYS, ICONS } from "../icons"
import { ColorChoice, EditorSection } from "./editor-parts"

const FORMATS = ["number", "percent", "currency", "duration"] as const

/** O nome vai por `aria-labelledby`: é só assim que ele chega ao campo de verdade, que fica dentro do polegar. */
function NamedSlider({ label, ...props }: ComponentProps<typeof Slider> & { label: string }) {
  const id = useId()
  return (
    <>
      <span id={id} className="sr-only">
        {label}
      </span>
      <Slider aria-labelledby={id} {...props} />
    </>
  )
}

export function AppearanceSection() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const widgetType = useWatch({ control, name: "widgetType" })
  const visual = useWatch({ control, name: "visual" })
  const metrics = useWatch({ control, name: "metrics" }) as EditorMetric[]
  const spec = WIDGET_SPECS[widgetType]
  const dirty = { shouldDirty: true }
  const isBar = widgetType === "bar_chart"
  const isArea = widgetType === "area_chart"
  const seriesCount = spec.multipleMetrics && widgetType !== "table" ? metrics.length : 0
  const usesColor = widgetType !== "table" && widgetType !== "rich_text" && widgetType !== "pie_chart" && widgetType !== "donut_chart" && widgetType !== "funnel" && widgetType !== "heatmap"
  const usesLegend = spec.axes || widgetType === "pie_chart" || widgetType === "donut_chart" || widgetType === "radar"
  const keys = metricKeys(metrics.map((metric) => ({ label: metric.label })))

  return (
    <div className="flex flex-col gap-6">
      {widgetType !== "section_divider" ? (
        <EditorSection title={t("customDashboards.appearance.icon")} hint={t("customDashboards.appearance.iconHint")}>
          <div role="group" aria-label={t("customDashboards.appearance.icon")} className="flex flex-wrap gap-1">
            {WIDGET_ICON_KEYS.map((key) => {
              const Icon = ICONS[key]
              const selected = visual.icon === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={t(`customDashboards.icons.${key}`)}
                  title={t(`customDashboards.icons.${key}`)}
                  onClick={() => setValue("visual.icon", selected ? null : key, dirty)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-muted-foreground ring-1 ring-foreground/10 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-10",
                    selected && "bg-primary/5 text-primary ring-2 ring-primary"
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              )
            })}
          </div>
        </EditorSection>
      ) : null}

      {usesColor && seriesCount <= 1 ? (
        <EditorSection
          title={t("customDashboards.appearance.color")}
          hint={t(widgetType === "section_divider" ? "customDashboards.appearance.dividerColorHint" : "customDashboards.appearance.colorHint")}
        >
          <ColorChoice
            label={t("customDashboards.appearance.color")}
            value={visual.color}
            onChange={(value) => setValue("visual.color", value, dirty)}
          />
        </EditorSection>
      ) : null}

      {seriesCount > 1 ? (
        <EditorSection title={t("customDashboards.appearance.seriesColors")} hint={t("customDashboards.appearance.seriesColorsHint")}>
          <div className="flex flex-col gap-2">
            {metrics.map((_, index) => (
              <div key={index} className="flex flex-col gap-1">
                <p className="truncate text-xs text-muted-foreground">{keys[index]}</p>
                <ColorChoice
                  label={keys[index]}
                  value={visual.colors[index] ?? null}
                  onChange={(value) => {
                    const next = Array.from({ length: metrics.length }, (_, position) => visual.colors[position] ?? "")
                    next[index] = value ?? ""
                    setValue("visual.colors", next, dirty)
                  }}
                />
              </div>
            ))}
          </div>
        </EditorSection>
      ) : null}

      {spec.figure || widgetType === "table" || spec.axes || widgetType === "pie_chart" || widgetType === "donut_chart" || widgetType === "funnel" || widgetType === "heatmap" ? (
        <EditorSection title={t("customDashboards.appearance.numbers")}>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t("customDashboards.appearance.format")}</p>
            <SegmentedControl
              aria-label={t("customDashboards.appearance.format")}
              fullWidth
              value={visual.format}
              onChange={(next) => setValue("visual.format", next, dirty)}
              options={FORMATS.map((format) => ({ value: format, label: t(`customDashboards.appearance.formats.${format}`) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t("customDashboards.appearance.decimals")}</p>
            <SegmentedControl
              aria-label={t("customDashboards.appearance.decimals")}
              value={visual.decimalPrecision === null ? "auto" : String(visual.decimalPrecision)}
              onChange={(next) => setValue("visual.decimalPrecision", next === "auto" ? null : Number(next), dirty)}
              options={["auto", "0", "1", "2", "3"].map((value) => ({
                value,
                label: value === "auto" ? t("customDashboards.appearance.decimalsAuto") : value,
              }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              control={control}
              name="visual.prefix"
              label={t("customDashboards.appearance.prefix")}
              placeholder={t("customDashboards.appearance.prefixPlaceholder")}
              optional
            />
            <TextField
              control={control}
              name="visual.suffix"
              label={t("customDashboards.appearance.suffix")}
              placeholder={t("customDashboards.appearance.suffixPlaceholder")}
              optional
            />
          </div>
        </EditorSection>
      ) : null}

      {spec.figure ? (
        <EditorSection title={t("customDashboards.appearance.figure")}>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{t("customDashboards.appearance.fontSize")}</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("customDashboards.appearance.fontSizeValue", { size: visual.fontSize ?? 28 })}
              </span>
            </div>
            <NamedSlider
              label={t("customDashboards.appearance.fontSize")}
              min={16}
              max={48}
              step={1}
              value={[visual.fontSize ?? 28]}
              onValueChange={(next) => setValue("visual.fontSize", Array.isArray(next) ? next[0] : next, dirty)}
            />
          </div>
          {!spec.goal ? (
            <>
              <SwitchField
                control={control}
                name="visual.compare"
                label={t("customDashboards.appearance.compare")}
                hint={t("customDashboards.appearance.compareHint")}
              />
              {visual.compare ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">{t("customDashboards.appearance.goodWhen")}</p>
                  <SegmentedControl
                    aria-label={t("customDashboards.appearance.goodWhen")}
                    value={visual.goodWhen}
                    onChange={(next) => setValue("visual.goodWhen", next, dirty)}
                    options={[
                      { value: "up", label: t("customDashboards.appearance.goodWhenUp") },
                      { value: "down", label: t("customDashboards.appearance.goodWhenDown") },
                    ]}
                  />
                </div>
              ) : null}
              <TextField
                control={control}
                name="visual.comparisonLabel"
                label={t("customDashboards.appearance.comparisonLabel")}
                placeholder={t("customDashboards.appearance.comparisonPlaceholder")}
                optional
              />
            </>
          ) : null}
        </EditorSection>
      ) : null}

      {usesLegend ? (
        <EditorSection title={t("customDashboards.appearance.display")}>
          <div className="flex flex-col gap-3">
            <SwitchField control={control} name="visual.showLegend" label={t("customDashboards.appearance.legend")} />
            {spec.axes ? (
              <>
                <SwitchField control={control} name="visual.showGrid" label={t("customDashboards.appearance.grid")} />
                <SwitchField
                  control={control}
                  name="visual.showValues"
                  label={t("customDashboards.appearance.values")}
                  hint={t("customDashboards.appearance.valuesHint")}
                />
              </>
            ) : null}
            {spec.axes && !isBar ? (
              <SwitchField control={control} name="visual.curved" label={t("customDashboards.appearance.smooth")} />
            ) : null}
            {isBar ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{t("customDashboards.appearance.orientation")}</p>
                  <SegmentedControl
                    aria-label={t("customDashboards.appearance.orientation")}
                    value={visual.horizontal === null ? "auto" : visual.horizontal ? "horizontal" : "vertical"}
                    onChange={(next) => setValue("visual.horizontal", next === "auto" ? null : next === "horizontal", dirty)}
                    options={[
                      { value: "auto", label: t("customDashboards.appearance.orientationAuto") },
                      { value: "vertical", label: t("customDashboards.appearance.orientationVertical") },
                      { value: "horizontal", label: t("customDashboards.appearance.orientationHorizontal") },
                    ]}
                  />
                </div>
              </>
            ) : null}
            {isBar || isArea ? (
              <SwitchField
                control={control}
                name="visual.stacked"
                label={t("customDashboards.appearance.stacked")}
                hint={t("customDashboards.appearance.stackedHint")}
              />
            ) : null}
          </div>
        </EditorSection>
      ) : null}

      {isArea || widgetType === "radar" ? (
        <EditorSection title={t("customDashboards.appearance.opacity")}>
          <div className="flex items-center gap-3">
            <NamedSlider
              label={t("customDashboards.appearance.opacity")}
              min={0.05}
              max={1}
              step={0.05}
              value={[visual.opacity]}
              onValueChange={(next) => setValue("visual.opacity", Array.isArray(next) ? next[0] : next, dirty)}
            />
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {t("customDashboards.appearance.opacityValue", { value: Math.round(visual.opacity * 100) })}
            </span>
          </div>
        </EditorSection>
      ) : null}

      {widgetType === "rich_text" || widgetType === "section_divider" ? (
        <EditorSection title={t("customDashboards.appearance.textSize")}>
          <NamedSlider
            label={t("customDashboards.appearance.textSize")}
            min={12}
            max={24}
            step={1}
            value={[visual.fontSize ?? (widgetType === "rich_text" ? 14 : 15)]}
            onValueChange={(next) => setValue("visual.fontSize", Array.isArray(next) ? next[0] : next, dirty)}
          />
        </EditorSection>
      ) : null}
    </div>
  )
}
