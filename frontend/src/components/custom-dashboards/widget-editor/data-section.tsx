import { useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  Callout,
  DateRangePicker,
  FormField,
  MultiSelectInput,
  NumberField,
  NumberInput,
  SearchableSelect,
  SegmentedControl,
  SelectInput,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/shared"
import { useFilterOptions } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { MAX_FILTERS, MAX_ROWS, WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import {
  adaptToSource,
  CARD_PERIOD_PRESETS,
  recordFields,
  shouldStack,
  type EditorValues,
  type PeriodMode,
} from "@/lib/custom-dashboards/editor-model"
import { categoryDimensions, dateFields, DEFAULT_ROWS, defaultDateField } from "@/lib/custom-dashboards/query"
import type { DataSourceMeta, FormulaStep, Granularity } from "@/lib/custom-dashboards/types"

import { EditorSection } from "./editor-parts"
import { FiltersEditor } from "./filters-editor"
import { FormulaEditor } from "./formula-editor"
import { MetricsEditor } from "./metrics-editor"
import { TypePicker } from "./type-picker"

const GRANULARITIES: (Granularity | "none")[] = ["none", "day", "week", "month", "year"]

export function DataSection({ sources }: { sources: DataSourceMeta[] }) {
  const { t } = useTranslation()
  const form = useFormContext<EditorValues>()
  const { control, setValue, getValues } = form
  const widgetType = useWatch({ control, name: "widgetType" })
  const dataSource = useWatch({ control, name: "dataSource" })
  const useFormula = useWatch({ control, name: "useFormula" })
  const records = useWatch({ control, name: "records" })
  const metricCount = (useWatch({ control, name: "metrics" }) ?? []).length

  const spec = WIDGET_SPECS[widgetType]
  const source = sources.find((item) => item.key === dataSource)
  const { filterOptions } = useFilterOptions(dataSource)
  const dirty = { shouldDirty: true }

  function changeSource(key: string | null) {
    const next = adaptToSource(getValues(), sources.find((item) => item.key === key))
    form.reset(next, { keepDefaultValues: true })
    setValue("dataSource", key, dirty)
  }

  // Ligou a fórmula pela primeira vez: já nasce com uma conta que faz sentido, e a prévia mostra alguma coisa.
  useEffect(() => {
    if (!useFormula || getValues("formulaSteps").length > 0) return
    const base = source ?? sources[0]
    setValue(
      "formulaSteps",
      [
        { id: "A", label: "A", dataSource: base?.key ?? "", aggregation: "count" },
        { id: "B", label: "B", dataSource: base?.key ?? "", aggregation: "count" },
      ],
      { shouldDirty: true }
    )
    setValue("formula", "PERCENT(A, B)", { shouldDirty: true })
  }, [getValues, setValue, source, sources, useFormula])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField control={control} name="title" label={t(widgetType === "section_divider" ? "customDashboards.editor.sectionTitle" : "customDashboards.editor.title")} maxLength={200} />
        {widgetType !== "section_divider" ? (
          <TextField control={control} name="subtitle" label={t("customDashboards.editor.subtitle")} optional />
        ) : null}
      </div>

      {spec.needsData ? <TypePicker sources={sources} /> : null}

      {widgetType === "rich_text" ? (
        <TextareaField
          control={control}
          name="visual.content"
          label={t("customDashboards.editor.content")}
          hint={t("customDashboards.editor.contentHint")}
          rows={8}
        />
      ) : null}

      {spec.goal ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField control={control} name="visual.goalValue" label={t("customDashboards.editor.goal")} min={0} />
          <TextField
            control={control}
            name="visual.goalLabel"
            label={t("customDashboards.editor.goalLabel")}
            placeholder={t("customDashboards.editor.goalLabelPlaceholder")}
            optional
          />
        </div>
      ) : null}

      {spec.needsData ? (
        <>
          <SwitchField
            control={control}
            name="useFormula"
            label={t("customDashboards.editor.useFormula")}
            hint={t("customDashboards.editor.useFormulaHint")}
          />
          {useFormula ? (
            <>
              <EditorSection title={t("customDashboards.formula.stepsTitle")} hint={t("customDashboards.formula.stepsHint")}>
                <FormulaEditor sources={sources} />
              </EditorSection>
              <GroupingSection sources={sources} source={sources.find((item) => item.key === getValues("formulaSteps")[0]?.dataSource)} formula />
            </>
          ) : (
            <>
              <EditorSection title={t("customDashboards.editor.whatToMeasure")}>
                <FormField control={control} name="dataSource" label={t("customDashboards.editor.source")}>
                  {({ controlProps }) => (
                    <SelectInput
                      {...controlProps}
                      options={sources.map((item) => ({ value: item.key, label: item.label }))}
                      value={dataSource}
                      onChange={changeSource}
                      placeholder={t("customDashboards.editor.sourcePlaceholder")}
                    />
                  )}
                </FormField>

                {widgetType === "table" ? (
                  <SegmentedControl
                    aria-label={t("customDashboards.editor.tableMode")}
                    value={records ? "records" : "summary"}
                    onChange={(next) => setValue("records", next === "records", dirty)}
                    options={[
                      { value: "summary", label: t("customDashboards.editor.tableSummary") },
                      { value: "records", label: t("customDashboards.editor.tableRecords") },
                    ]}
                  />
                ) : null}

                {source && !records ? (
                  <MetricsEditor
                    source={source}
                    filterOptions={filterOptions}
                    multiple={spec.multipleMetrics}
                    columns={widgetType === "table"}
                  />
                ) : null}

                {source && !records && widgetType === "table" ? (
                  <SwitchField
                    control={control}
                    name="visual.showTotals"
                    label={t("customDashboards.editor.showTotals")}
                    hint={t("customDashboards.editor.showTotalsHint")}
                  />
                ) : null}

                {source && records ? <RecordColumns source={source} /> : null}
              </EditorSection>

              {source && !records ? <GroupingSection sources={sources} source={source} metricCount={metricCount} /> : null}

              {source ? (
                <EditorSection title={t(records ? "customDashboards.filters.titleRecords" : "customDashboards.filters.title")} hint={t("customDashboards.filters.hint")}>
                  <FiltersEditor name="filters" source={source} filterOptions={filterOptions} max={MAX_FILTERS} />
                </EditorSection>
              ) : null}

              {source ? <SortSection source={source} /> : null}
            </>
          )}

          {source || useFormula ? <PeriodSection source={source} /> : null}
        </>
      ) : null}
    </div>
  )
}

function RecordColumns({ source }: { source: DataSourceMeta }) {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const columns = useWatch({ control, name: "columns" })
  const options = useMemo(() => recordFields(source).map((field) => ({ value: field.key, label: field.label })), [source])

  return (
    <FormField
      control={control}
      name="columns"
      label={t("customDashboards.editor.columns")}
      hint={t("customDashboards.editor.columnsHint")}
      optional
    >
      {({ controlProps }) => (
        <MultiSelectInput
          {...controlProps}
          options={options}
          value={columns}
          onChange={(next) => setValue("columns", next, { shouldDirty: true })}
          placeholder={t("customDashboards.editor.columnsPlaceholder")}
        />
      )}
    </FormField>
  )
}

/** "Ao longo do tempo" e "Separar por": é aqui que "quantas conversas por semana, por canal" vira duas escolhas. */
function GroupingSection({
  sources,
  source,
  formula = false,
  metricCount = 1,
}: {
  sources: DataSourceMeta[]
  source: DataSourceMeta | undefined
  formula?: boolean
  metricCount?: number
}) {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const widgetType = useWatch({ control, name: "widgetType" })
  const granularity = useWatch({ control, name: "granularity" })
  const timeField = useWatch({ control, name: "timeField" })
  const breakdown = useWatch({ control, name: "breakdown" })
  const steps = useWatch({ control, name: "formulaSteps" }) as FormulaStep[]
  const { filterOptions } = useFilterOptions(source?.key)
  const { grouping, multipleMetrics } = WIDGET_SPECS[widgetType]
  const dirty = { shouldDirty: true }

  const breakdownOptions = useMemo(() => {
    const list = formula ? stepSources(steps, sources) : source ? [source] : []
    const seen = new Set<string>()
    const options = list.flatMap((item) => categoryDimensions(item)).flatMap((dimension) => {
      if (seen.has(dimension.key)) return []
      seen.add(dimension.key)
      return [{ value: dimension.key, label: dimension.label }]
    })
    const custom = source?.supportsCustomAttributeDimensions
      ? (filterOptions?.custom_attributes ?? []).map((item) => ({
          value: `custom_attributes.${item.value}`,
          label: item.label,
          description: t("customDashboards.editor.customField"),
        }))
      : []
    return [...options, ...custom]
  }, [filterOptions, formula, source, sources, steps, t])

  if (grouping === "none") return null

  const showTime = grouping !== "category"
  const showBreakdown = grouping !== "time"
  const dates = dateFields(source)
  const hasTime = granularity !== "none"

  return (
    <EditorSection title={t("customDashboards.editor.howToGroup")}>
      {showTime ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">
            {t("customDashboards.editor.overTime")}
          </p>
          <SegmentedControl
            aria-label={t("customDashboards.editor.overTime")}
            fullWidth
            value={granularity}
            onChange={(next) => {
              setValue("granularity", next, dirty)
              if (next !== "none" && !timeField) setValue("timeField", defaultDateField(source) ?? null, dirty)
              if (shouldStack({ widgetType, granularity: next, breakdown })) setValue("visual.stacked", true, dirty)
            }}
            options={GRANULARITIES.filter((item) => item !== "none" || grouping !== "time").map((item) => ({
              value: item,
              label: t(`customDashboards.granularity.${item}`),
            }))}
          />
        </div>
      ) : null}

      {showTime && hasTime && dates.length > 1 && !formula ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{t("customDashboards.editor.dateField")}</p>
          <SelectInput
            aria-label={t("customDashboards.editor.dateField")}
            options={dates.map((field) => ({ value: field.key, label: field.label }))}
            value={timeField ?? defaultDateField(source)}
            onChange={(next) => setValue("timeField", next, dirty)}
          />
        </div>
      ) : null}

      {showBreakdown && breakdownOptions.length === 0 && grouping === "category" ? (
        <Callout tone="neutral">{t("customDashboards.editor.noBreakdown", { source: source?.label })}</Callout>
      ) : null}

      {showBreakdown && (breakdownOptions.length > 0 || grouping === "category") ? (
        <FormField
          control={control}
          name="breakdown"
          label={t(grouping === "category" ? "customDashboards.editor.divideBy" : "customDashboards.editor.splitBy")}
        >
          {({ controlProps }) => (
            <SearchableSelect
              {...controlProps}
              value={breakdown}
              onChange={(next) => {
                setValue("breakdown", next, { shouldDirty: true, shouldValidate: true })
                if (shouldStack({ widgetType, granularity, breakdown: next })) setValue("visual.stacked", true, dirty)
              }}
              options={breakdownOptions}
              clearable={grouping !== "category"}
              placeholder={t(
                grouping === "category" ? "customDashboards.editor.divideByPlaceholder" : "customDashboards.editor.splitByPlaceholder"
              )}
            />
          )}
        </FormField>
      ) : null}

      {multipleMetrics && hasTime && breakdown && metricCount > 1 ? (
        <Callout tone="neutral">{t("customDashboards.editor.onlyFirstMetric")}</Callout>
      ) : null}
      {formula && breakdown ? <p className="text-xs text-muted-foreground">{t("customDashboards.formula.breakdownHint")}</p> : null}
    </EditorSection>
  )
}

function stepSources(steps: FormulaStep[] | undefined, sources: DataSourceMeta[]) {
  return (steps ?? []).flatMap((step) => sources.find((item) => item.key === step.dataSource) ?? [])
}

function SortSection({ source }: { source: DataSourceMeta }) {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const widgetType = useWatch({ control, name: "widgetType" })
  const records = useWatch({ control, name: "records" })
  const granularity = useWatch({ control, name: "granularity" })
  const breakdown = useWatch({ control, name: "breakdown" })
  const metrics = useWatch({ control, name: "metrics" })
  const sortField = useWatch({ control, name: "sortField" })
  const sortDirection = useWatch({ control, name: "sortDirection" })
  const limit = useWatch({ control, name: "limit" })
  const { grouping } = WIDGET_SPECS[widgetType]
  const dirty = { shouldDirty: true }

  // Série no tempo tem ordem de nascença, e número sozinho não tem o que ordenar.
  const relevant = records || (grouping !== "none" && grouping !== "time" && granularity === "none" && Boolean(breakdown))
  if (!relevant) return null

  const options = records
    ? recordFields(source).map((field) => ({ value: field.key, label: field.label }))
    : (metrics ?? []).flatMap((metric) =>
        metric.formula === null && metric.label?.trim() ? [{ value: metric.label.trim(), label: metric.label.trim() }] : []
      )

  return (
    <EditorSection title={t("customDashboards.editor.orderAndLimit")}>
      {/* Pelo topo, com o mesmo rótulo nos dois campos: o campo escondido do NumberField deixa folga embaixo dele. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_7rem] sm:items-start">
        <FormField control={control} name="sortField" label={t("customDashboards.editor.orderBy")} className="min-w-0">
          {({ controlProps }) => (
            <SelectInput
              {...controlProps}
              options={options}
              value={sortField}
              onChange={(next) => setValue("sortField", next, dirty)}
              clearLabel={t(records ? "customDashboards.editor.orderDefaultRecords" : "customDashboards.editor.orderDefault")}
              placeholder={t(records ? "customDashboards.editor.orderDefaultRecords" : "customDashboards.editor.orderDefault")}
            />
          )}
        </FormField>
        <div className="sm:pt-5">
          <SegmentedControl
            aria-label={t("customDashboards.editor.orderDirection")}
            value={sortDirection}
            onChange={(next) => setValue("sortDirection", next, dirty)}
            options={[
              { value: "desc", label: t("customDashboards.editor.orderDesc") },
              { value: "asc", label: t("customDashboards.editor.orderAsc") },
            ]}
          />
        </div>
        <FormField control={control} name="limit" label={t("customDashboards.editor.limit")}>
          {({ controlProps }) => (
            <NumberInput
              {...controlProps}
              value={limit}
              onChange={(next) => setValue("limit", next, { shouldDirty: true, shouldValidate: true })}
              min={1}
              max={MAX_ROWS}
              placeholder={String(DEFAULT_ROWS)}
            />
          )}
        </FormField>
      </div>
    </EditorSection>
  )
}

function PeriodSection({ source }: { source: DataSourceMeta | undefined }) {
  const { t } = useTranslation()
  const form = useFormContext<EditorValues>()
  const { control, setValue } = form
  const mode = useWatch({ control, name: "periodMode" })
  const preset = useWatch({ control, name: "periodPreset" })
  const range = useWatch({ control, name: "periodRange" })
  const dateField = useWatch({ control, name: "dateField" })
  const useFormula = useWatch({ control, name: "useFormula" })
  const granularity = useWatch({ control, name: "granularity" })
  const widgetType = useWatch({ control, name: "widgetType" })
  const dates = dateFields(source)
  const dirty = { shouldDirty: true }
  const error = form.formState.errors.periodRange?.message
  const groupsByTime = granularity !== "none" && WIDGET_SPECS[widgetType].grouping !== "category"

  return (
    <EditorSection title={t("customDashboards.editor.period")} hint={t("customDashboards.editor.periodHint")}>
      <SegmentedControl<PeriodMode>
        aria-label={t("customDashboards.editor.period")}
        fullWidth
        value={mode}
        onChange={(next) => setValue("periodMode", next, dirty)}
        options={[
          { value: "dashboard", label: t("customDashboards.editor.periodDashboard") },
          { value: "preset", label: t("customDashboards.editor.periodPreset") },
          { value: "custom", label: t("customDashboards.editor.periodCustom") },
        ]}
      />

      {mode === "preset" ? (
        <SelectInput
          aria-label={t("customDashboards.editor.periodPreset")}
          options={CARD_PERIOD_PRESETS.map((value) => ({ value, label: t(`customDashboards.period.presets.${value}`) }))}
          value={preset}
          onChange={(next) => setValue("periodPreset", next ?? "30d", dirty)}
        />
      ) : null}

      {mode === "custom" ? (
        <div className="flex flex-col gap-1">
          <DateRangePicker
            label={t("customDashboards.editor.periodCustom")}
            value={range}
            onChange={(next) => setValue("periodRange", next, { shouldDirty: true, shouldValidate: true })}
            required
          />
          {error ? <p className="text-xs text-destructive">{String(error)}</p> : null}
        </div>
      ) : null}

      {!useFormula && dates.length > 1 && !groupsByTime ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{t("customDashboards.editor.countBy")}</p>
          <SelectInput
            aria-label={t("customDashboards.editor.countBy")}
            options={dates.map((field) => ({ value: field.key, label: field.label }))}
            value={dateField}
            onChange={(next) => setValue("dateField", next, dirty)}
            clearLabel={t("customDashboards.editor.countByDefault")}
            placeholder={t("customDashboards.editor.countByDefault")}
          />
        </div>
      ) : null}
    </EditorSection>
  )
}
