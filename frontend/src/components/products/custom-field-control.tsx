import type { Control } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  CurrencyField,
  DateField,
  FormField,
  NumberField,
  SwitchField,
  TextField,
} from "@/components/shared"
import type { ItemFormValues } from "@/lib/products/item-form"
import { isPriceField } from "@/lib/products/pricing"
import type { ProductField } from "@/lib/products/types"
import { CreatableSelect } from "./creatable-select"

type CustomFieldControlProps = {
  control: Control<ItemFormValues, unknown, ItemFormValues>
  field: ProductField
  /** Cadastra uma opção nova em campo de lista, sem sair da tela do item. */
  onCreateOption: (field: ProductField, option: string) => Promise<unknown>
}

/** O tipo do campo escolhe o controle. Campo obrigatório é a exceção, e é ele que se marca. */
export function CustomFieldControl({ control, field, onCreateOption }: CustomFieldControlProps) {
  const { t } = useTranslation()

  const name = `customFields.${field.key}` as const
  const common = {
    control,
    name,
    label: field.name,
    hint: field.description ?? undefined,
    action: field.required ? (
      <span className="text-xs leading-none text-muted-foreground">
        {t("products.fieldControl.required")}
      </span>
    ) : undefined,
  }

  switch (field.valueType) {
    case "checkbox":
      return (
        <SwitchField
          control={control}
          name={name}
          label={field.name}
          hint={field.description ?? undefined}
        />
      )
    case "number":
      return isPriceField(field) ? <CurrencyField {...common} /> : <NumberField {...common} />
    case "date":
      return <DateField {...common} clearable />
    case "url":
      return (
        <TextField
          {...common}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          placeholder={t("products.fieldControl.urlPlaceholder")}
        />
      )
    case "list":
      return (
        <FormField {...common}>
          {({ field: controller, controlProps }) => (
            <CreatableSelect
              {...controlProps}
              inputRef={controller.ref}
              options={field.optionValues}
              value={typeof controller.value === "string" ? controller.value : null}
              onChange={(next) => controller.onChange(next ?? "")}
              onBlur={controller.onBlur}
              onCreate={(option) => onCreateOption(field, option)}
              placeholder={t("products.fieldControl.listPlaceholder")}
            />
          )}
        </FormField>
      )
    default:
      return <TextField {...common} />
  }
}
