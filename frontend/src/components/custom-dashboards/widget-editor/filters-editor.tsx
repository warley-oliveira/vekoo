import { useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ListFilter, Plus, X } from "lucide-react"

import { HiddenLabel } from "@/components/pipelines/hidden-label"
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
import { CUSTOM_ATTRIBUTE_PREFIX, useFilterFieldOptions } from "@/hooks/custom-dashboards/use-editor-options"
import { parseDay } from "@/hooks/insights/use-dashboard-period"
import { toDateInputValue } from "@/lib/date-format"
import { VALUELESS_OPERATORS, type EditorValues } from "@/lib/custom-dashboards/editor-model"
import type { DataSourceMeta, FilterOperator, FilterOptions } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

const MULTI: FilterOperator[] = ["in", "nin"]
const SET_OPERATORS: FilterOperator[] = ["eq", "ne", "in", "nin"]
const COMPARISONS: FilterOperator[] = ["gt", "gte", "lt", "lte"]

type FieldKind = "options" | "set" | "number" | "date" | "boolean" | "text" | "custom" | "customNumber"

type FieldInfo = {
  kind: FieldKind
  operators: FilterOperator[]
  options: SelectOption[]
}

/** O que a tela sabe de um campo: como se escolhe o valor, e quais comparações a API aceita para ele. */
function fieldInfo(name: string, source: DataSourceMeta | undefined, filterOptions: FilterOptions | undefined): FieldInfo {
  if (name.startsWith(CUSTOM_ATTRIBUTE_PREFIX)) {
    const definition = filterOptions?.custom_attributes?.find((item) => `${CUSTOM_ATTRIBUTE_PREFIX}${item.value}` === name)
    const options = (definition?.optionValues ?? []).map((value) => ({ value, label: value }))
    const numeric = definition?.valueType === "number"
    return {
      kind: numeric ? "customNumber" : "custom",
      options,
      operators: ["eq", "ne", "in", "nin", "contains", "exists", "not_exists", ...(numeric ? COMPARISONS : [])],
    }
  }

  const field = source?.fields.find((item) => item.key === name)
  const named = filterOptions?.[name]?.map((option) => ({ value: option.value, label: option.label }))
  const enumOptions = field?.enumValues?.filter((value): value is string => Boolean(value)).map((value) => ({ value, label: value }))

  if (field?.filterType === "relationship") {
    return { kind: "set", operators: SET_OPERATORS, options: named ?? [] }
  }
  if (field?.type === "boolean") {
    return {
      kind: "boolean",
      operators: ["eq", "ne"],
      options: named ?? [
        { value: "true", label: "true" },
        { value: "false", label: "false" },
      ],
    }
  }
  if (field?.type === "number") {
    return { kind: "number", operators: ["eq", "ne", ...COMPARISONS, "in", "nin", "exists", "not_exists"], options: [] }
  }
  if (field?.type === "date") {
    return { kind: "date", operators: [...COMPARISONS, "exists", "not_exists"], options: [] }
  }
  const options = named ?? enumOptions ?? []
  if (options.length) {
    return { kind: "options", operators: ["eq", "ne", "in", "nin", "exists", "not_exists"], options }
  }
  return { kind: "text", operators: ["eq", "ne", "in", "nin", "contains", "exists", "not_exists"], options: [] }
}

type FiltersEditorProps = {
  /** O caminho do formulário: `filters`, `metrics.0.filters`, `formulaSteps.1.filters`. */
  name: string
  source: DataSourceMeta | undefined
  filterOptions: FilterOptions | undefined
  max: number
  addLabel?: string
}

/** "Só contar quando…": um campo, uma comparação em português, e o controle certo para o valor. */
export function FiltersEditor({ name, source, filterOptions, max, addLabel }: FiltersEditorProps) {
  const { t } = useTranslation()
  const { control } = useFormContext<EditorValues>()
  const { fields, append, remove } = useFieldArray({ control, name: name as "filters" })
  const fieldOptions = useFilterFieldOptions(source, filterOptions)

  return (
    <div className="flex flex-col gap-2">
      {fields.map((item, index) => (
        <FilterRow
          key={item.id}
          path={`${name}.${index}`}
          source={source}
          filterOptions={filterOptions}
          fieldOptions={fieldOptions}
          onRemove={() => remove(index)}
        />
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground pointer-coarse:h-10"
        disabled={fields.length >= max || fieldOptions.length === 0}
        onClick={() => {
          const first = fieldOptions[0]?.value ?? ""
          const info = fieldInfo(first, source, filterOptions)
          append({ field: first, operator: info.operators[0], value: "" })
        }}
      >
        {fields.length ? <Plus /> : <ListFilter />}
        {addLabel ?? t("customDashboards.filters.add")}
      </Button>
    </div>
  )
}

function FilterRow({
  path,
  source,
  filterOptions,
  fieldOptions,
  onRemove,
}: {
  path: string
  source: DataSourceMeta | undefined
  filterOptions: FilterOptions | undefined
  fieldOptions: SelectOption[]
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<EditorValues>()
  const fieldName = `${path}.field` as "filters.0.field"
  const operatorName = `${path}.operator` as "filters.0.operator"
  const valueName = `${path}.value` as "filters.0.value"

  const field = useWatch({ control, name: fieldName }) as string
  const operator = useWatch({ control, name: operatorName }) as FilterOperator
  const value = useWatch({ control, name: valueName })
  const { errors } = useFormState({ control, name: valueName })
  const error = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], errors) as
    | { value?: { message?: string } }
    | undefined

  const info = fieldInfo(field, source, filterOptions)
  const operatorOptions = info.operators.map((item) => ({ value: item, label: t(`customDashboards.filters.operators.${item}`) }))
  const multi = MULTI.includes(operator)
  const dirty = { shouldDirty: true, shouldValidate: false }

  function changeField(next: string | null) {
    if (!next) return
    const nextInfo = fieldInfo(next, source, filterOptions)
    setValue(fieldName, next, dirty)
    setValue(operatorName, nextInfo.operators.includes(operator) ? operator : nextInfo.operators[0], dirty)
    setValue(valueName, MULTI.includes(operator) && nextInfo.operators.includes(operator) ? [] : "", dirty)
  }

  function changeOperator(next: string | null) {
    if (!next) return
    const nextOperator = next as FilterOperator
    setValue(operatorName, nextOperator, dirty)
    if (MULTI.includes(nextOperator) !== multi) setValue(valueName, MULTI.includes(nextOperator) ? [] : "", dirty)
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2">
      <div className="flex items-center gap-1.5">
        <HiddenLabel text={t("customDashboards.filters.field")}>
          {(id) => (
            <SearchableSelect
              id={id}
              value={field}
              onChange={changeField}
              options={fieldOptions}
              placeholder={t("customDashboards.filters.field")}
              className="min-w-0 flex-1 bg-background"
            />
          )}
        </HiddenLabel>
        <div className="w-40 shrink-0">
          <SelectInput
            aria-label={t("customDashboards.filters.operator")}
            options={operatorOptions}
            value={operator}
            onChange={changeOperator}
            className="bg-background"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("customDashboards.filters.remove")}
          className="shrink-0 text-muted-foreground"
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      {VALUELESS_OPERATORS.includes(operator) ? null : (
        <FilterValue
          info={info}
          multi={multi}
          operator={operator}
          value={value}
          invalid={Boolean(error?.value)}
          onChange={(next) => setValue(valueName, next, dirty)}
        />
      )}
      {error?.value?.message ? <p className="text-xs text-destructive">{error.value.message}</p> : null}
    </div>
  )
}

function FilterValue({
  info,
  multi,
  operator,
  value,
  invalid,
  onChange,
}: {
  info: FieldInfo
  multi: boolean
  operator: FilterOperator
  value: unknown
  invalid: boolean
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  const label = t("customDashboards.filters.value")
  const className = cn("bg-background", invalid && "border-destructive")
  const list = Array.isArray(value) ? (value as string[]) : []
  const text = typeof value === "string" || typeof value === "number" ? String(value) : ""

  if (multi) {
    return (
      <HiddenLabel text={label}>
        {(id) =>
          info.options.length ? (
            <MultiSelectInput
              id={id}
              options={info.options}
              value={list}
              onChange={onChange}
              placeholder={t("customDashboards.filters.pickMany")}
              className={className}
            />
          ) : (
            <ChipsInput id={id} value={list} onChange={onChange} placeholder={t("customDashboards.filters.typeMany")} className={className} />
          )
        }
      </HiddenLabel>
    )
  }

  if (info.kind === "date") {
    return (
      <DatePicker
        label={label}
        value={text ? parseDay(text) : null}
        onChange={(date) => onChange(date ? toDateInputValue(date) : "")}
        className={className}
      />
    )
  }

  if (info.kind === "number" || (info.kind === "customNumber" && COMPARISONS.includes(operator))) {
    return (
      <HiddenLabel text={label}>
        {(id) => (
          <NumberInput
            id={id}
            value={text === "" ? null : Number(text)}
            onChange={(next) => onChange(next ?? "")}
            placeholder={label}
            className={className}
          />
        )}
      </HiddenLabel>
    )
  }

  if (info.options.length && operator !== "contains") {
    return info.options.length > 8 ? (
      <HiddenLabel text={label}>
        {(id) => (
          <SearchableSelect
            id={id}
            value={text}
            onChange={(next) => onChange(next ?? "")}
            options={info.options}
            placeholder={t("customDashboards.filters.pick")}
            className={className}
          />
        )}
      </HiddenLabel>
    ) : (
      <SelectInput
        aria-label={label}
        value={text || null}
        onChange={(next) => onChange(next ?? "")}
        options={info.options}
        placeholder={t("customDashboards.filters.pick")}
        className={className}
      />
    )
  }

  return <Input aria-label={label} value={text} onChange={(event) => onChange(event.target.value)} placeholder={label} className={className} />
}
