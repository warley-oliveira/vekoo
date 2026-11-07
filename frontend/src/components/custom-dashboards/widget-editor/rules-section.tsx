import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, WandSparkles } from "lucide-react"

import { NumberInput, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useFilterOptions } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import type { EditorValues } from "@/lib/custom-dashboards/editor-model"
import type { DataSourceMeta } from "@/lib/custom-dashboards/types"

import { ColorChoice, EditorSection } from "./editor-parts"

const RULE_OPERATORS = ["gte", "gt", "lte", "lt", "eq"] as const

/** O que entra na aba: só o que o tipo usa. Sem nada, a aba nem aparece. */
export function hasRules(values: Pick<EditorValues, "widgetType" | "breakdown">) {
  const spec = WIDGET_SPECS[values.widgetType]
  return spec.figure || spec.axes || Boolean(values.breakdown)
}

export function RulesSection({ sources }: { sources: DataSourceMeta[] }) {
  const { control } = useFormContext<EditorValues>()
  const widgetType = useWatch({ control, name: "widgetType" })
  const breakdown = useWatch({ control, name: "breakdown" })
  const dataSource = useWatch({ control, name: "dataSource" })
  const spec = WIDGET_SPECS[widgetType]
  const source = sources.find((item) => item.key === dataSource)

  return (
    <div className="flex flex-col gap-6">
      {breakdown && widgetType !== "table" ? <ValueMapEditor field={breakdown} source={source} /> : null}
      {spec.axes ? <ThresholdsEditor /> : null}
      {spec.figure ? <ConditionalRulesEditor /> : null}
    </div>
  )
}

/** O nome e a cor de cada valor: "whatsapp_api" pode virar "WhatsApp da loja", sempre em verde. */
function ValueMapEditor({ field, source }: { field: string; source: DataSourceMeta | undefined }) {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const valueMap = useWatch({ control, name: "visual.valueMap" })
  const { filterOptions } = useFilterOptions(source?.key)
  const [draft, setDraft] = useState("")
  const dirty = { shouldDirty: true }

  const known = filterOptions?.[field] ?? []
  const entries = Object.entries(valueMap)

  function update(next: EditorValues["visual"]["valueMap"]) {
    setValue("visual.valueMap", next, dirty)
  }

  function add() {
    const key = draft.trim()
    if (!key || valueMap[key]) return
    update({ ...valueMap, [key]: { label: "", color: null } })
    setDraft("")
  }

  return (
    <EditorSection
      title={t("customDashboards.rules.valueMap")}
      hint={t("customDashboards.rules.valueMapHint")}
      action={
        known.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => {
              const next = { ...valueMap }
              for (const option of known) next[option.value] ??= { label: "", color: null }
              update(next)
            }}
          >
            <WandSparkles />
            {t("customDashboards.rules.autoFill")}
          </Button>
        ) : null
      }
    >
      {entries.length ? (
        <ul className="flex flex-col gap-2">
          {entries.map(([key, entry]) => {
            const fallback = known.find((option) => option.value === key)?.label ?? key
            return (
              <li key={key} className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label={t("customDashboards.rules.valueName", { value: fallback })}
                    value={entry.label}
                    placeholder={fallback}
                    onChange={(event) => update({ ...valueMap, [key]: { ...entry, label: event.target.value } })}
                    className="min-w-0 flex-1 bg-background"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("customDashboards.rules.removeValue", { value: fallback })}
                    className="shrink-0 text-muted-foreground"
                    onClick={() => {
                      const { [key]: _removed, ...rest } = valueMap
                      update(rest)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <ColorChoice
                  label={t("customDashboards.rules.valueColor", { value: fallback })}
                  value={entry.color}
                  onChange={(color) => update({ ...valueMap, [key]: { ...entry, color } })}
                />
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Input
          aria-label={t("customDashboards.rules.addValue")}
          value={draft}
          placeholder={t("customDashboards.rules.addValuePlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="outline" size="sm" disabled={!draft.trim()} onClick={add} className="pointer-coarse:h-10">
          {t("customDashboards.rules.add")}
        </Button>
      </div>
    </EditorSection>
  )
}

function ThresholdsEditor() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const thresholds = useWatch({ control, name: "visual.thresholds" })
  const dirty = { shouldDirty: true }

  function update(next: EditorValues["visual"]["thresholds"]) {
    setValue("visual.thresholds", next, dirty)
  }

  return (
    <EditorSection
      title={t("customDashboards.rules.thresholds")}
      hint={t("customDashboards.rules.thresholdsHint")}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => update([...thresholds, { value: null, label: "", color: null }])}
        >
          <Plus />
          {t("customDashboards.rules.add")}
        </Button>
      }
    >
      {thresholds.map((line, index) => (
        <div key={index} className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2">
          <div className="flex items-center gap-1.5">
            <div className="w-28 shrink-0">
              <NumberInput
                value={line.value}
                placeholder={t("customDashboards.rules.value")}
                onChange={(value) => update(thresholds.map((item, position) => (position === index ? { ...item, value } : item)))}
                className="bg-background"
              />
            </div>
            <Input
              aria-label={t("customDashboards.rules.lineLabel")}
              value={line.label}
              placeholder={t("customDashboards.rules.lineLabel")}
              onChange={(event) =>
                update(thresholds.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)))
              }
              className="min-w-0 flex-1 bg-background"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("customDashboards.rules.removeLine")}
              className="shrink-0 text-muted-foreground"
              onClick={() => update(thresholds.filter((_, position) => position !== index))}
            >
              <Trash2 />
            </Button>
          </div>
          <ColorChoice
            label={t("customDashboards.rules.lineColor")}
            value={line.color}
            onChange={(color) => update(thresholds.map((item, position) => (position === index ? { ...item, color } : item)))}
          />
        </div>
      ))}
    </EditorSection>
  )
}

/** Faixas: "abaixo de 50, crítico". Em meta, a faixa é sobre o percentual da meta. A primeira que casa vale. */
function ConditionalRulesEditor() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const rules = useWatch({ control, name: "visual.conditionalRules" })
  const widgetType = useWatch({ control, name: "widgetType" })
  const goal = WIDGET_SPECS[widgetType].goal
  const dirty = { shouldDirty: true }

  function update(next: EditorValues["visual"]["conditionalRules"]) {
    setValue("visual.conditionalRules", next, dirty)
  }

  return (
    <EditorSection
      title={t("customDashboards.rules.conditional")}
      hint={t(goal ? "customDashboards.rules.conditionalGoalHint" : "customDashboards.rules.conditionalHint")}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => update([...rules, { operator: "gte", value: null, color: "tone-success" }])}
        >
          <Plus />
          {t("customDashboards.rules.addRule")}
        </Button>
      }
    >
      {rules.map((rule, index) => (
        <div key={index} className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2">
          <div className="flex items-center gap-1.5">
            <div className="w-40 shrink-0">
              <SelectInput
                aria-label={t("customDashboards.rules.when")}
                options={RULE_OPERATORS.map((value) => ({ value, label: t(`customDashboards.filters.operators.${value}`) }))}
                value={rule.operator}
                onChange={(next) => {
                  if (next) update(rules.map((item, position) => (position === index ? { ...item, operator: next as typeof item.operator } : item)))
                }}
                className="bg-background"
              />
            </div>
            <NumberInput
              value={rule.value}
              placeholder={t("customDashboards.rules.value")}
              onChange={(value) => update(rules.map((item, position) => (position === index ? { ...item, value } : item)))}
              className="min-w-0 flex-1 bg-background"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("customDashboards.rules.removeRule")}
              className="shrink-0 text-muted-foreground"
              onClick={() => update(rules.filter((_, position) => position !== index))}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t("customDashboards.rules.show")}
            <ColorChoice
              label={t("customDashboards.rules.show")}
              palette="tones"
              allowAuto={false}
              value={rule.color}
              onChange={(color) => {
                if (color) update(rules.map((item, position) => (position === index ? { ...item, color } : item)))
              }}
            />
            {rule.color.startsWith("tone-") ? (
              <span className="font-medium text-foreground">{t(`customDashboards.rules.toneNames.${rule.color}`)}</span>
            ) : null}
          </div>
        </div>
      ))}
    </EditorSection>
  )
}
