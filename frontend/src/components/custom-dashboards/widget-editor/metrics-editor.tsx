import { useState } from "react"
import { useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, ListFilter, Plus, X } from "lucide-react"

import { SearchableSelect, SegmentedControl, SelectInput, TextField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useMeasureOptions } from "@/hooks/custom-dashboards/use-editor-options"
import { columnLetter, MAX_METRIC_FILTERS, MAX_METRICS, MAX_TABLE_COLUMNS } from "@/lib/custom-dashboards/catalog"
import { emptyMetric, type EditorMetric, type EditorValues } from "@/lib/custom-dashboards/editor-model"
import { validateFormula } from "@/lib/custom-dashboards/formula-engine"
import type { Aggregation, DataSourceMeta, FilterOptions } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { useFormulaErrorMessage } from "../use-formula-error"
import { FiltersEditor } from "./filters-editor"

type MetricsEditorProps = {
  source: DataSourceMeta | undefined
  filterOptions: FilterOptions | undefined
  /** Mais de uma medida. */
  multiple: boolean
  /** Tabela: cada medida é uma coluna, com letra, ordem e a opção de ser calculada. */
  columns: boolean
}

/** O que medir, sem falar em agregação: "Quantidade", ou "Soma de" um campo. */
export function MetricsEditor({ source, filterOptions, multiple, columns }: MetricsEditorProps) {
  const { t } = useTranslation()
  const { control } = useFormContext<EditorValues>()
  const { fields, append, remove, move } = useFieldArray({ control, name: "metrics" })
  const max = columns ? MAX_TABLE_COLUMNS : MAX_METRICS

  return (
    <div className="flex flex-col gap-2">
      {fields.map((item, index) => (
        <MetricRow
          key={item.id}
          index={index}
          total={fields.length}
          source={source}
          filterOptions={filterOptions}
          columns={columns}
          multiple={multiple}
          onRemove={() => remove(index)}
          onMove={(delta) => move(index, index + delta)}
        />
      ))}
      {multiple ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground pointer-coarse:h-10"
          disabled={fields.length >= max}
          onClick={() => append(emptyMetric())}
        >
          <Plus />
          {t(columns ? "customDashboards.measure.addColumn" : "customDashboards.measure.add")}
        </Button>
      ) : null}
    </div>
  )
}

function MetricRow({
  index,
  total,
  source,
  filterOptions,
  columns,
  multiple,
  onRemove,
  onMove,
}: {
  index: number
  total: number
  source: DataSourceMeta | undefined
  filterOptions: FilterOptions | undefined
  columns: boolean
  multiple: boolean
  onRemove: () => void
  onMove: (delta: number) => void
}) {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const metric = useWatch({ control, name: `metrics.${index}` }) as EditorMetric | undefined
  const { errors } = useFormState({ control, name: `metrics.${index}` })
  const { aggregations, fieldsFor } = useMeasureOptions(source)
  const [showFilters, setShowFilters] = useState(Boolean(metric?.filters.length))
  const message = useFormulaErrorMessage()

  if (!metric) return null

  const isFormula = metric.formula !== null
  const filterCount = metric.filters.length
  const dirty = { shouldDirty: true, shouldValidate: false }
  const options = fieldsFor(metric.aggregation)
  const typeOptions = columns
    ? [...aggregations, { value: "formula", label: t("customDashboards.measure.formula") }]
    : aggregations
  const onlyCount = aggregations.length <= 1 && !columns
  const rowError = errors.metrics?.[index]
  const otherLetters = Array.from({ length: total }, (_, position) => columnLetter(position)).filter((_, position) => position !== index)
  const formulaError = isFormula && metric.formula ? validateFormula(metric.formula, otherLetters) : null

  function changeType(next: string | null) {
    if (!next) return
    if (next === "formula") {
      setValue(`metrics.${index}`, { ...metric!, aggregation: "count", field: null, filters: [], formula: "" }, dirty)
      return
    }
    const aggregation = next as Aggregation
    const keep = fieldsFor(aggregation).some((field) => field.value === metric!.field)
    setValue(
      `metrics.${index}`,
      {
        ...metric!,
        aggregation,
        formula: null,
        field: aggregation === "count" ? null : keep ? metric!.field : (fieldsFor(aggregation)[0]?.value ?? null),
      },
      dirty
    )
  }

  const fieldError = rowError?.field?.message

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2">
      <div className="flex items-center gap-1.5">
        {columns ? (
          <span
            aria-hidden
            title={t("customDashboards.measure.letterHint", { letter: columnLetter(index) })}
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-xs font-medium ring-1 ring-foreground/10"
          >
            {columnLetter(index)}
          </span>
        ) : null}

        {onlyCount ? (
          <p className="flex h-8 min-w-0 flex-1 items-center truncate rounded-md bg-background px-2.5 text-sm ring-1 ring-input">
            {t("customDashboards.measure.count")}
          </p>
        ) : (
          <div className="min-w-0 flex-1">
            <SelectInput
              aria-label={t("customDashboards.measure.type")}
              options={typeOptions}
              value={isFormula ? "formula" : metric.aggregation}
              onChange={changeType}
              className="bg-background"
            />
          </div>
        )}

        {!isFormula && metric.aggregation !== "count" ? (
          <SearchableSelect
            aria-label={t("customDashboards.measure.field")}
            value={metric.field}
            onChange={(next) => setValue(`metrics.${index}.field`, next, dirty)}
            options={options}
            placeholder={t("customDashboards.measure.field")}
            aria-invalid={Boolean(fieldError)}
            className="min-w-0 flex-1 bg-background"
          />
        ) : null}

        {columns && total > 1 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              aria-label={t("customDashboards.measure.moveUp")}
              className="shrink-0 text-muted-foreground"
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === total - 1}
              aria-label={t("customDashboards.measure.moveDown")}
              className="shrink-0 text-muted-foreground"
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
          </>
        ) : null}

        {total > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("customDashboards.measure.remove")}
            className="shrink-0 text-muted-foreground"
            onClick={onRemove}
          >
            <X />
          </Button>
        ) : null}
      </div>
      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}

      {columns || (multiple && total > 1) ? (
        <TextField
          control={control}
          name={`metrics.${index}.label`}
          label={t(columns ? "customDashboards.measure.columnName" : "customDashboards.measure.name")}
          placeholder={t("customDashboards.measure.namePlaceholder")}
          optional={!isFormula}
          inputClassName="bg-background"
        />
      ) : null}

      {isFormula ? (
        <div className="flex flex-col gap-1">
          <Textarea
            rows={2}
            aria-label={t("customDashboards.measure.formula")}
            aria-invalid={Boolean(formulaError || rowError?.formula)}
            value={metric.formula ?? ""}
            placeholder={t("customDashboards.measure.formulaPlaceholder")}
            spellCheck={false}
            onChange={(event) => setValue(`metrics.${index}.formula`, event.target.value, dirty)}
            className="min-h-0 bg-background font-mono text-sm"
          />
          <p className={cn("text-xs", formulaError || rowError?.formula ? "text-destructive" : "text-muted-foreground")}>
            {formulaError ? message(formulaError) : (rowError?.formula?.message ?? t("customDashboards.measure.formulaHint"))}
          </p>
        </div>
      ) : source?.supportsMetricFilters ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-expanded={showFilters}
            className={cn("self-start text-muted-foreground", filterCount > 0 && "text-foreground")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <ListFilter />
            {t("customDashboards.measure.onlyWhen", { count: filterCount })}
          </Button>
          {showFilters ? (
            <div className="flex flex-col gap-2">
              {filterCount >= 2 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t("customDashboards.measure.combine")}
                  <SegmentedControl
                    aria-label={t("customDashboards.measure.combine")}
                    value={metric.filtersOperator}
                    onChange={(next) => setValue(`metrics.${index}.filtersOperator`, next, dirty)}
                    options={[
                      { value: "and", label: t("customDashboards.measure.combineAnd") },
                      { value: "or", label: t("customDashboards.measure.combineOr") },
                    ]}
                  />
                </div>
              ) : null}
              <FiltersEditor
                name={`metrics.${index}.filters`}
                source={source}
                filterOptions={filterOptions}
                max={MAX_METRIC_FILTERS}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
