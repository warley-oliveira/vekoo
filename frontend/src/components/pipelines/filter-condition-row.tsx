import { memo, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"

import {
  ChipsInput,
  DatePicker,
  MultiSelectInput,
  NumberInput,
  SearchableSelect,
  SelectInput,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { localDayKey, parseDayKey } from "@/lib/pipelines/card-meta"
import {
  ME_VALUE,
  MULTI_OPERATORS,
  OPERATORS_BY_KIND,
  PARAMETERIZED_TOKENS,
  POINT_OPERATORS,
  POINT_TOKENS,
  RANGE_OPERATORS,
  RANGE_TOKENS,
  VALUELESS_OPERATORS,
  type CatalogField,
  type ConditionRow,
} from "@/lib/pipelines/filter-catalog"
import {
  CARD_PRIORITIES,
  DEAL_STATUSES,
  type FilterOperator,
  type Label,
  type PersonOption,
  type RelativeToken,
  type Stage,
} from "@/lib/pipelines/types"

export type ConditionContext = {
  catalog: CatalogField[]
  stages: Stage[]
  labels: Label[]
  people: PersonOption[]
}

const EXACT_DATE = "__exact__"

function DateValue({
  row,
  operator,
  onPatch,
}: {
  row: ConditionRow
  operator: FilterOperator
  onPatch: (patch: Partial<ConditionRow>) => void
}) {
  const { t } = useTranslation()
  const isRange = RANGE_OPERATORS.includes(operator)
  const tokens = isRange ? RANGE_TOKENS : POINT_TOKENS

  const pick = (key: "value" | "valueTo") => (
    <DatePicker
      aria-label={t("pipelines.filters.builder.value")}
      value={row[key] ? parseDayKey(row[key]) : null}
      onChange={(date) => onPatch({ [key]: date ? localDayKey(date) : "" })}
    />
  )

  if (operator === "eq") return pick("value")
  if (operator === "between") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {pick("value")}
        {pick("valueTo")}
      </div>
    )
  }

  const options: SelectOption[] = [
    ...(POINT_OPERATORS.includes(operator)
      ? [{ value: EXACT_DATE, label: t("pipelines.filters.relative.exact") }]
      : []),
    ...tokens.map((token) => ({ value: token, label: t(`pipelines.filters.relative.${token}`) })),
  ]
  const mode = row.token || (POINT_OPERATORS.includes(operator) ? EXACT_DATE : null)

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <SelectInput
        aria-label={t("pipelines.filters.builder.value")}
        options={options}
        value={mode}
        onChange={(next) =>
          onPatch(
            !next || next === EXACT_DATE
              ? { token: "", tokenN: "" }
              : { token: next as RelativeToken, value: "" }
          )
        }
      />
      {mode === EXACT_DATE ? pick("value") : null}
      {row.token && PARAMETERIZED_TOKENS.includes(row.token) ? (
        <NumberInput
          aria-label={t("pipelines.filters.builder.amount")}
          className="sm:w-20"
          min={1}
          value={row.tokenN ? Number(row.tokenN) : null}
          onChange={(value) => onPatch({ tokenN: value === null ? "" : String(value) })}
        />
      ) : null}
    </div>
  )
}

function ConditionValue({
  row,
  field,
  context,
  onPatch,
}: {
  row: ConditionRow
  field: CatalogField
  context: ConditionContext
  onPatch: (patch: Partial<ConditionRow>) => void
}) {
  const { t } = useTranslation()
  const operator = row.operator as FilterOperator

  const options = useMemo<SelectOption[]>(() => {
    switch (field.key) {
      case "priority":
        return CARD_PRIORITIES.map((value) => ({ value, label: t(`pipelines.priority.${value}`) }))
      case "stage_id":
        return context.stages.map((stage) => ({ value: stage.id, label: stage.name }))
      case "deal_status":
        return DEAL_STATUSES.map((value) => ({ value, label: t(`pipelines.deal.status.${value}`) }))
      case "label_ids":
        return context.labels.map((label) => ({ value: label.id, label: label.name }))
    }
    if (field.kind === "user") {
      return context.people.map((person) => ({ value: person.id, label: person.name }))
    }
    return (field.options ?? []).map((value) => ({ value, label: value }))
  }, [context.labels, context.people, context.stages, field, t])

  if (VALUELESS_OPERATORS.includes(operator)) {
    return <p className="flex h-8 items-center text-sm text-muted-foreground">{t("pipelines.filters.builder.noValue")}</p>
  }

  if (field.kind === "date") return <DateValue row={row} operator={operator} onPatch={onPatch} />

  if (field.kind === "boolean" || field.kind === "virtual") {
    return (
      <SelectInput
        aria-label={t("pipelines.filters.builder.value")}
        options={[
          { value: "true", label: t("pipelines.filters.yes") },
          { value: "false", label: t("pipelines.filters.no") },
        ]}
        value={row.value || null}
        onChange={(value) => onPatch({ value: value ?? "" })}
      />
    )
  }

  if (operator === "between") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          aria-label={t("pipelines.filters.builder.value")}
          placeholder={t("pipelines.filters.min")}
          value={row.value === "" ? null : Number(row.value)}
          onChange={(value) => onPatch({ value: value === null ? "" : String(value) })}
        />
        <NumberInput
          aria-label={t("pipelines.filters.builder.valueTo")}
          placeholder={t("pipelines.filters.max")}
          value={row.valueTo === "" ? null : Number(row.valueTo)}
          onChange={(value) => onPatch({ valueTo: value === null ? "" : String(value) })}
        />
      </div>
    )
  }

  if (MULTI_OPERATORS.includes(operator)) {
    if (field.kind === "tags") {
      return (
        <ChipsInput
          aria-label={t("pipelines.filters.builder.value")}
          value={row.list}
          placeholder={t("pipelines.filters.builder.tagsPlaceholder")}
          onChange={(list) => onPatch({ list })}
        />
      )
    }
    return (
      <MultiSelectInput
        aria-label={t("pipelines.filters.builder.value")}
        options={options}
        value={row.list}
        onChange={(list) => onPatch({ list })}
      />
    )
  }

  if (field.kind === "select" || field.kind === "user") {
    const single =
      field.kind === "user"
        ? [{ value: ME_VALUE, label: t("pipelines.filters.builder.me") }, ...options]
        : options
    return (
      <SearchableSelect
        aria-label={t("pipelines.filters.builder.value")}
        options={single}
        value={row.value || null}
        onChange={(value) => onPatch({ value: value ?? "" })}
      />
    )
  }

  if (field.kind === "number") {
    return (
      <NumberInput
        aria-label={t("pipelines.filters.builder.value")}
        value={row.value === "" ? null : Number(row.value)}
        onChange={(value) => onPatch({ value: value === null ? "" : String(value) })}
      />
    )
  }

  return (
    <Input
      aria-label={t("pipelines.filters.builder.value")}
      value={row.value}
      onChange={(event) => onPatch({ value: event.target.value })}
    />
  )
}

type FilterConditionRowProps = {
  row: ConditionRow
  context: ConditionContext
  onChange: (id: string, patch: Partial<ConditionRow>) => void
  onRemove: (id: string) => void
}

/** Uma condição: campo, operador e o valor no controle que o tipo pede. */
export const FilterConditionRow = memo(function FilterConditionRow({
  row,
  context,
  onChange,
  onRemove,
}: FilterConditionRowProps) {
  const { t } = useTranslation()
  const field = context.catalog.find((candidate) => candidate.key === row.field)

  const fieldOptions = useMemo<SelectOption[]>(
    () =>
      context.catalog.map((candidate) => ({
        value: candidate.key,
        label:
          candidate.label ??
          t(`pipelines.filters.fields.${candidate.labelKey}`),
        description: t(`pipelines.filters.groups.${candidate.group}`),
      })),
    [context.catalog, t]
  )

  const operatorOptions = useMemo<SelectOption[]>(
    () =>
      (field ? OPERATORS_BY_KIND[field.kind] : []).map((operator) => ({
        value: operator,
        label: t(`pipelines.filters.operators.${operator}`),
      })),
    [field, t]
  )

  const patch = useCallback(
    (values: Partial<ConditionRow>) => onChange(row.id, values),
    [onChange, row.id]
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 md:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_minmax(0,1fr)_auto]">
      <SearchableSelect
        aria-label={t("pipelines.filters.builder.field")}
        className="max-md:col-start-1"
        placeholder={t("pipelines.filters.builder.field")}
        options={fieldOptions}
        value={row.field || null}
        onChange={(value) => {
          const next = context.catalog.find((candidate) => candidate.key === value)
          patch({
            field: value ?? "",
            operator: next ? OPERATORS_BY_KIND[next.kind][0] : "",
            value: "",
            valueTo: "",
            list: [],
            token: "",
            tokenN: "",
          })
        }}
      />
      <div className="max-md:col-start-1 max-md:row-start-2">
        <SelectInput
          aria-label={t("pipelines.filters.builder.operator")}
          placeholder={t("pipelines.filters.builder.operator")}
          disabled={!field}
          options={operatorOptions}
          value={row.operator || null}
          onChange={(value) =>
            patch({
              operator: (value ?? "") as FilterOperator | "",
              value: "",
              valueTo: "",
              list: [],
              token: "",
              tokenN: "",
            })
          }
        />
      </div>
      <div className="min-w-0 max-md:col-start-1 max-md:row-start-3">
        {field && row.operator ? (
          <ConditionValue row={row} field={field} context={context} onPatch={patch} />
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground max-md:col-start-2 max-md:row-start-1 pointer-coarse:size-10"
        aria-label={t("pipelines.filters.builder.removeCondition")}
        onClick={() => onRemove(row.id)}
      >
        <Trash2 />
      </Button>
    </div>
  )
})
