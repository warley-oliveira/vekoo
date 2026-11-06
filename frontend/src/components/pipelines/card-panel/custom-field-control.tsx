import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { DatePicker, NumberInput, SearchableSelect, SelectInput } from "@/components/shared"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { isBlankValue, localDayKey, parseDayKey } from "@/lib/pipelines/card-meta"
import type { CustomField } from "@/lib/pipelines/types"

type CustomFieldControlProps = {
  field: CustomField
  value: unknown
  onChange: (value: unknown) => void
  /** Quem desenha o campo liga o rótulo a este `id`. */
  id: string
}

/** O controle de um campo personalizado, pelo tipo. Texto salva ao sair; o resto, ao escolher. */
export function CustomFieldControl({ field, value, onChange, id }: CustomFieldControlProps) {
  const { t } = useTranslation()
  const { assignable } = usePeopleOptions()

  // O texto só vai para o servidor ao sair do campo. Enquanto isso, um evento não pode apagar o
  // que está sendo digitado, então a edição fica aqui.
  const [draft, setDraft] = useState(String(value ?? ""))
  useEffect(() => {
    setDraft(String(value ?? ""))
  }, [value])

  const label = field.name

  switch (field.fieldType) {
    case "number":
      return (
        <NumberInput
          id={id}
          value={isBlankValue(value) ? null : Number(value)}
          onChange={(next) => onChange(next)}
        />
      )
    case "date":
      return (
        <DatePicker
          id={id}
          label={label}
          clearable
          value={typeof value === "string" && value ? parseDayKey(value.slice(0, 10)) : null}
          onChange={(date) => onChange(date ? localDayKey(date) : null)}
        />
      )
    case "select":
      return (
        <SelectInput
          id={id}
          aria-label={label}
          clearLabel={t("pipelines.fields.clear")}
          value={isBlankValue(value) ? null : String(value)}
          options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
          onChange={(next) => onChange(next)}
        />
      )
    case "checkbox":
      return (
        <Checkbox
          id={id}
          aria-label={label}
          className="border-muted-foreground/40"
          checked={value === true || value === "true"}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      )
    case "user":
      return (
        <SearchableSelect
          id={id}
          clearable
          value={isBlankValue(value) ? null : String(value)}
          options={assignable.map((person) => ({ value: person.id, label: person.name }))}
          onChange={(next) => onChange(next)}
        />
      )
    default:
      return (
        <Input
          id={id}
          aria-label={label}
          type={field.fieldType === "url" ? "url" : "text"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== String(value ?? "")) onChange(draft)
          }}
        />
      )
  }
}
