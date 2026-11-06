import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  DateRangePicker,
  FacetedFilter,
  NumberInput,
  SearchInput,
  SegmentedControl,
} from "@/components/shared"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import type { FieldFilter, FieldFilterOperator } from "@/lib/contacts/filters"
import type { CustomField } from "@/lib/contacts/types"
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date-format"

type FieldControlProps = {
  field: CustomField
  /** As condições deste campo. */
  value: FieldFilter[]
  onChange: (next: FieldFilter[]) => void
}

function valueOf(filters: FieldFilter[], op: FieldFilterOperator) {
  return filters.find((filter) => filter.op === op)?.value ?? null
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-sm font-medium">{children}</span>
}

function TextControl({ field, value, onChange }: FieldControlProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{field.name}</FieldLabel>
      <SearchInput
        shortcut={false}
        aria-label={field.name}
        placeholder={t("contacts.filters.custom.contains")}
        value={valueOf(value, "has") ?? ""}
        onChange={(next) =>
          onChange(next.trim() ? [{ key: field.key, op: "has", value: next.trim() }] : [])
        }
      />
    </div>
  )
}

function ListControl({ field, value, onChange }: FieldControlProps) {
  const options = useMemo(
    () => field.optionValues.map((option) => ({ value: option, label: option })),
    [field.optionValues]
  )

  return (
    <FacetedFilter
      title={field.name}
      options={options}
      value={value.filter((filter) => filter.op === "in").map((filter) => filter.value)}
      onChange={(next) =>
        onChange(next.map((option) => ({ key: field.key, op: "in", value: option })))
      }
    />
  )
}

/** Uma ponta do intervalo: o número digitado fica aqui, e a consulta só sai quando a pessoa para. */
function NumberBound({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string | null
  onCommit: (next: number | null) => void
}) {
  const parsed = value === null ? null : Number(value)
  const [draft, setDraft] = useState<number | null>(parsed)

  // O que vem de fora (limpar filtros, voltar no navegador) substitui o rascunho.
  const [last, setLast] = useState(value)
  if (value !== last) {
    setLast(value)
    setDraft(parsed)
  }

  const commit = useDebouncedCallback(onCommit, 400)

  return (
    <NumberInput
      aria-label={label}
      placeholder={label}
      value={draft}
      onChange={(next) => {
        setDraft(next)
        commit(next)
      }}
      className="min-w-0 flex-1"
    />
  )
}

function NumberControl({ field, value, onChange }: FieldControlProps) {
  const { t } = useTranslation()

  function setBound(op: "gt" | "lt", next: number | null) {
    const others = value.filter((filter) => filter.op !== op)
    onChange(next === null ? others : [...others, { key: field.key, op, value: String(next) }])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{field.name}</FieldLabel>
      <div className="flex items-center gap-2">
        <NumberBound
          label={t("contacts.filters.custom.greaterThan")}
          value={valueOf(value, "gt")}
          onCommit={(next) => setBound("gt", next)}
        />
        <NumberBound
          label={t("contacts.filters.custom.lessThan")}
          value={valueOf(value, "lt")}
          onCommit={(next) => setBound("lt", next)}
        />
      </div>
    </div>
  )
}

function CheckboxControl({ field, value, onChange }: FieldControlProps) {
  const { t } = useTranslation()
  const current = value[0]?.op === "yes" ? "yes" : value[0]?.op === "no" ? "no" : "any"

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{field.name}</FieldLabel>
      <SegmentedControl
        aria-label={field.name}
        fullWidth
        value={current}
        onChange={(next) =>
          onChange(next === "any" ? [] : [{ key: field.key, op: next, value: "" }])
        }
        options={[
          { value: "any" as const, label: t("contacts.filters.custom.any") },
          { value: "yes" as const, label: t("contacts.custom.yes") },
          { value: "no" as const, label: t("contacts.custom.no") },
        ]}
      />
    </div>
  )
}

function DateControl({ field, value, onChange }: FieldControlProps) {
  const from = valueOf(value, "from")
  const to = valueOf(value, "to")

  return (
    <DateRangePicker
      label={field.name}
      value={
        from && to
          ? { from: startOfDay(`${from}T12:00:00`), to: endOfDay(`${to}T12:00:00`) }
          : null
      }
      onChange={(next) =>
        onChange(
          next
            ? [
                { key: field.key, op: "from", value: toDateInputValue(next.from) },
                { key: field.key, op: "to", value: toDateInputValue(next.to) },
              ]
            : []
        )
      }
    />
  )
}

const CONTROLS = {
  text: TextControl,
  list: ListControl,
  number: NumberControl,
  checkbox: CheckboxControl,
  date: DateControl,
} as const

/** Um controle por campo, do tipo dele: segmentar é escolher valores, e não montar uma consulta. */
export function CustomFieldFilters({
  fields,
  value,
  onChange,
}: {
  fields: CustomField[]
  value: FieldFilter[]
  onChange: (next: FieldFilter[]) => void
}) {
  return (
    <>
      {fields.map((field) => {
        const Control = CONTROLS[field.valueType] ?? TextControl
        return (
          <Control
            key={field.id}
            field={field}
            value={value.filter((filter) => filter.key === field.key)}
            onChange={(next) =>
              onChange([...value.filter((filter) => filter.key !== field.key), ...next])
            }
          />
        )
      })}
    </>
  )
}
