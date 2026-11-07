import { useMemo, useRef, useState } from "react"
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CircleHelp, Plus, X } from "lucide-react"

import { HiddenLabel } from "@/components/pipelines/hidden-label"
import { SearchableSelect, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useFilterOptions } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { useMeasureOptions } from "@/hooks/custom-dashboards/use-editor-options"
import { columnLetter, MAX_FILTERS, MAX_FORMULA_STEPS } from "@/lib/custom-dashboards/catalog"
import type { EditorValues } from "@/lib/custom-dashboards/editor-model"
import { validateFormula } from "@/lib/custom-dashboards/formula-engine"
import type { Aggregation, DataSourceMeta, FormulaStep } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { useFormulaErrorMessage } from "../use-formula-error"
import { FiltersEditor } from "./filters-editor"

const QUICK_FUNCTIONS: { label: string; snippet: string; cursor: number }[] = [
  { label: "ROUND", snippet: "ROUND(, 2)", cursor: 6 },
  { label: "PERCENT", snippet: "PERCENT(, )", cursor: 8 },
  { label: "ABS", snippet: "ABS()", cursor: 4 },
  { label: "IF", snippet: "IF( > 0, , 0)", cursor: 3 },
  { label: "MIN", snippet: "MIN(, )", cursor: 4 },
  { label: "MAX", snippet: "MAX(, )", cursor: 4 },
  { label: "SQRT", snippet: "SQRT()", cursor: 5 },
  { label: "POW", snippet: "POW(, 2)", cursor: 4 },
]

function newStep(index: number, source: DataSourceMeta | undefined): FormulaStep {
  const letter = columnLetter(index)
  return { id: letter, label: letter, dataSource: source?.key ?? "", aggregation: "count" }
}

/** Os números que entram na conta, cada um com a sua letra, e a conta em cima deles. */
export function FormulaEditor({ sources }: { sources: DataSourceMeta[] }) {
  const { t } = useTranslation()
  const { control, setValue, getValues } = useFormContext<EditorValues>()
  const { fields, append, remove } = useFieldArray({ control, name: "formulaSteps", keyName: "fieldKey" })
  const steps = useWatch({ control, name: "formulaSteps" }) as FormulaStep[]
  const formula = useWatch({ control, name: "formula" }) as string
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const message = useFormulaErrorMessage()

  const stepIds = useMemo(() => (steps ?? []).map((step) => step.id), [steps])
  const liveError = formula?.trim() ? validateFormula(formula, stepIds) : null

  function insert(snippet: string, cursor: number) {
    const current = getValues("formula") ?? ""
    const element = textarea.current
    const start = element?.selectionStart ?? current.length
    const end = element?.selectionEnd ?? current.length
    const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`
    setValue("formula", next, { shouldDirty: true })
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + cursor, start + cursor)
    })
  }

  /** As letras acompanham a posição: A, B, C. Tirar o passo B faz o C virar B, e a fórmula precisa ser revista. */
  function removeStep(index: number) {
    remove(index)
    const next = getValues("formulaSteps")
    next.forEach((step, position) => {
      const letter = columnLetter(position)
      setValue(`formulaSteps.${position}.id`, letter, { shouldDirty: true })
      if (step.label === step.id) setValue(`formulaSteps.${position}.label`, letter, { shouldDirty: true })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {fields.map((item, index) => (
          <FormulaStepRow
            key={item.fieldKey}
            index={index}
            total={fields.length}
            sources={sources}
            onRemove={() => removeStep(index)}
          />
        ))}
        {fields.length < MAX_FORMULA_STEPS ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground pointer-coarse:h-10"
            onClick={() => append(newStep(fields.length, sources[0]))}
          >
            <Plus />
            {t("customDashboards.formula.addStep")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="cd-formula">{t("customDashboards.formula.label")}</Label>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-expanded={showGuide}
            className="text-muted-foreground"
            onClick={() => setShowGuide(!showGuide)}
          >
            <CircleHelp />
            {t("customDashboards.formula.guideToggle")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {stepIds.map((id) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="xs"
              aria-label={t("customDashboards.formula.insert", { value: id })}
              className="min-w-7 font-mono"
              onClick={() => insert(id, id.length)}
            >
              {id}
            </Button>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          {QUICK_FUNCTIONS.map((fn) => (
            <Button
              key={fn.label}
              type="button"
              variant="ghost"
              size="xs"
              aria-label={t("customDashboards.formula.insert", { value: fn.label })}
              className="font-mono text-muted-foreground"
              onClick={() => insert(fn.snippet, fn.cursor)}
            >
              {fn.label}
            </Button>
          ))}
        </div>

        <Controller
          control={control}
          name="formula"
          render={({ field, fieldState }) => {
            const error = liveError ? message(liveError) : fieldState.error?.message
            return (
              <>
                <Textarea
                  {...field}
                  id="cd-formula"
                  ref={(node) => {
                    field.ref(node)
                    textarea.current = node
                  }}
                  rows={2}
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby="cd-formula-message"
                  placeholder={t("customDashboards.formula.placeholder")}
                  className="min-h-0 font-mono text-sm"
                />
                <p
                  id="cd-formula-message"
                  role={error ? "alert" : undefined}
                  className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
                >
                  {error ?? t("customDashboards.formula.hint")}
                </p>
              </>
            )
          }}
        />

        {showGuide ? (
          <div className="rounded-lg bg-muted/50 p-3 text-xs">
            <p className="font-medium">{t("customDashboards.formula.guideTitle")}</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-muted-foreground">
              {(["math", "percent", "round", "compare", "if", "decimals"] as const).map((key) => (
                <li key={key}>{t(`customDashboards.formula.guide.${key}`)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function FormulaStepRow({
  index,
  total,
  sources,
  onRemove,
}: {
  index: number
  total: number
  sources: DataSourceMeta[]
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { control, setValue, formState } = useFormContext<EditorValues>()
  const step = useWatch({ control, name: `formulaSteps.${index}` }) as FormulaStep | undefined
  const source = sources.find((item) => item.key === step?.dataSource)
  const { filterOptions } = useFilterOptions(step?.dataSource)
  const { aggregations, fieldsFor } = useMeasureOptions(source)
  const [showFilters, setShowFilters] = useState(Boolean(step?.filters?.length))
  const dirty = { shouldDirty: true }

  if (!step) return null

  const fieldError = formState.errors.formulaSteps?.[index]?.metric?.message
  const filterCount = step.filters?.length ?? 0

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background font-mono text-xs font-medium ring-1 ring-foreground/10"
        >
          {step.id}
        </span>
        <Input
          aria-label={t("customDashboards.formula.stepName", { letter: step.id })}
          value={step.label === step.id ? "" : step.label}
          placeholder={t("customDashboards.formula.stepNamePlaceholder")}
          onChange={(event) => setValue(`formulaSteps.${index}.label`, event.target.value || step.id, dirty)}
          className="min-w-0 flex-1 bg-background"
        />
        {total > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("customDashboards.formula.removeStep", { letter: step.id })}
            className="shrink-0 text-muted-foreground"
            onClick={onRemove}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-3">
        <SelectInput
          aria-label={t("customDashboards.editor.source")}
          options={sources.map((item) => ({ value: item.key, label: item.label }))}
          value={step.dataSource}
          onChange={(next) => {
            if (!next) return
            setValue(`formulaSteps.${index}`, { ...step, dataSource: next, metric: undefined, aggregation: "count", filters: [] }, dirty)
          }}
          className="bg-background"
        />
        <SelectInput
          aria-label={t("customDashboards.measure.type")}
          options={aggregations}
          value={step.aggregation}
          onChange={(next) => {
            if (!next) return
            const aggregation = next as Aggregation
            setValue(
              `formulaSteps.${index}`,
              { ...step, aggregation, metric: aggregation === "count" ? undefined : (step.metric ?? fieldsFor(aggregation)[0]?.value) },
              dirty
            )
          }}
          className="bg-background"
        />
        {step.aggregation !== "count" ? (
          <HiddenLabel text={t("customDashboards.measure.field")}>
            {(id) => (
              <SearchableSelect
                id={id}
                value={step.metric ?? null}
                onChange={(next) => setValue(`formulaSteps.${index}.metric`, next ?? undefined, dirty)}
                options={fieldsFor(step.aggregation)}
                placeholder={t("customDashboards.measure.field")}
                aria-invalid={Boolean(fieldError)}
                className="bg-background"
              />
            )}
          </HiddenLabel>
        ) : null}
      </div>
      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}

      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-expanded={showFilters}
        className={cn("self-start text-muted-foreground", filterCount > 0 && "text-foreground")}
        onClick={() => setShowFilters(!showFilters)}
      >
        {t("customDashboards.measure.onlyWhen", { count: filterCount })}
      </Button>
      {showFilters ? (
        <FiltersEditor name={`formulaSteps.${index}.filters`} source={source} filterOptions={filterOptions} max={MAX_FILTERS} />
      ) : null}
    </div>
  )
}
