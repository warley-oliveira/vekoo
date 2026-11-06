import { useEffect, useMemo, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import {
  CopyButton,
  DateField,
  FormActions,
  NumberField,
  SelectField,
  SidePanel,
  SwitchField,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { useFieldMutations } from "@/hooks/products/use-products"
import {
  serializeDefaultValue,
  toFieldValue,
  type CustomFieldValue,
} from "@/lib/products/item-form"
import {
  FIELD_VALUE_TYPES,
  type FieldValueType,
  type ProductField,
} from "@/lib/products/types"
import { isWebUrl, normalizeWebUrl } from "@/lib/products/url"
import { ChipsField } from "@/components/shared/chips-input"

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      name: z.string().trim().min(1, t("products.fields.errors.nameRequired")),
      valueType: z.enum(FIELD_VALUE_TYPES),
      optionValues: z.array(z.string()),
      description: z.string(),
      defaultValue: z.custom<CustomFieldValue>(),
      required: z.boolean(),
      searchable: z.boolean(),
    })
    .superRefine((values, context) => {
      if (values.valueType === "list" && values.optionValues.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["optionValues"],
          message: t("products.fields.errors.optionsRequired"),
        })
      }
      if (
        values.valueType === "url" &&
        typeof values.defaultValue === "string" &&
        values.defaultValue.trim() &&
        !isWebUrl(normalizeWebUrl(values.defaultValue))
      ) {
        context.addIssue({
          code: "custom",
          path: ["defaultValue"],
          message: t("products.item.errors.urlInvalid"),
        })
      }
    })
}

type FieldFormValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(field: ProductField | null | undefined): FieldFormValues {
  const valueType = field?.valueType ?? "text"
  return {
    name: field?.name ?? "",
    valueType,
    optionValues: field?.optionValues ?? [],
    description: field?.description ?? "",
    defaultValue: toFieldValue(valueType, field?.defaultValue),
    required: field?.required ?? false,
    searchable: field?.searchable ?? true,
  }
}

type FieldFormPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editando. Sem ele, é cadastro. */
  field?: ProductField | null
  /** Onde um campo novo entra na lista. */
  nextPosition?: number
  onSaved?: (field: ProductField) => void
}

/**
 * Cadastrar e editar um campo personalizado. Os textos de "obrigatório" e "valor inicial"
 * dizem até onde cada um vale: a API guarda os dois sem aplicar, e quem aplica é só a tela
 * do item. A importação não confere nenhum dos dois.
 */
export function FieldFormPanel({
  open,
  onOpenChange,
  field = null,
  nextPosition,
  onSaved,
}: FieldFormPanelProps) {
  const { t } = useTranslation()
  const { saveField } = useFieldMutations()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<FieldFormValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(field),
    mode: "onBlur",
  })

  useEffect(() => {
    if (open) form.reset(valuesOf(field))
  }, [field, form, open])

  const valueType = useWatch({ control: form.control, name: "valueType" })
  const optionValues = useWatch({ control: form.control, name: "optionValues" })
  const defaultValue = useWatch({ control: form.control, name: "defaultValue" })

  // O valor inicial muda de forma junto com o tipo: um texto não serve para um número.
  const previousType = useRef(valueType)
  useEffect(() => {
    if (previousType.current === valueType) return
    previousType.current = valueType
    form.setValue(
      "defaultValue",
      toFieldValue(valueType, field?.valueType === valueType ? field.defaultValue : null)
    )
  }, [field, form, valueType])
  // Entre a troca de tipo e o efeito acima há uma pintura com o valor do tipo anterior.
  const defaultMatchesType =
    defaultValue === null ||
    (valueType === "number"
      ? typeof defaultValue === "number"
      : valueType === "date"
        ? defaultValue instanceof Date
        : typeof defaultValue === "string")

  const typeOptions = useMemo(
    () =>
      FIELD_VALUE_TYPES.map((value) => ({
        value,
        label: t(`products.fields.types.${value}`),
      })),
    [t]
  )

  const submit = useFormSubmit(form, async (values) => {
    const type: FieldValueType = values.valueType
    const options = type === "list" ? values.optionValues : []
    // Opção padrão que saiu da lista deixa de valer.
    const defaultValue =
      type === "list" && !options.includes(String(values.defaultValue ?? ""))
        ? null
        : serializeDefaultValue(type, values.defaultValue)

    const saved = await saveField(field?.id ?? null, {
      name: values.name,
      valueType: type,
      optionValues: options,
      description: values.description.trim() || null,
      defaultValue,
      required: type === "checkbox" ? false : values.required,
      searchable: values.searchable,
      ...(field ? {} : { position: nextPosition }),
    })
    toast.success(t(field ? "products.fields.saved" : "products.fields.created", { name: saved.name }))
    onSaved?.(saved)
    onOpenChange(false)
  })

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t(field ? "products.fields.editTitle" : "products.fields.createTitle")}
      description={t("products.fields.formHint")}
      onSubmit={submit}
      disablePointerDismissal={form.formState.isDirty}
      footer={
        <FormActions
          form={form}
          submitLabel={t(field ? "products.fields.save" : "products.fields.create")}
          onCancel={() => onOpenChange(false)}
          requireChanges={Boolean(field)}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <TextField
          control={form.control}
          name="name"
          label={t("products.fields.name")}
          // Ao cadastrar, digitar é o primeiro gesto. Ao editar, subir o teclado no celular
          // atrapalharia quem só quer virar uma chave.
          autoFocus={!field}
          maxLength={200}
          placeholder={t("products.fields.namePlaceholder")}
        />

        <SelectField
          control={form.control}
          name="valueType"
          label={t("products.fields.type")}
          options={typeOptions}
          hint={t(`products.fields.typeHints.${valueType}`)}
        />

        {valueType === "list" ? (
          <ChipsField
            control={form.control}
            name="optionValues"
            label={t("products.fields.options")}
            hint={t("products.fields.optionsHint")}
            placeholder={t("products.fields.optionsPlaceholder")}
          />
        ) : null}

        <TextField
          control={form.control}
          name="description"
          label={t("products.fields.description")}
          hint={t("products.fields.descriptionHint")}
          optional
        />

        {valueType === "checkbox" || !defaultMatchesType ? null : valueType === "number" ? (
          <NumberField
            control={form.control}
            name="defaultValue"
            label={t("products.fields.defaultValue")}
            hint={t("products.fields.defaultValueHint")}
            optional
          />
        ) : valueType === "date" ? (
          <DateField
            control={form.control}
            name="defaultValue"
            label={t("products.fields.defaultValue")}
            hint={t("products.fields.defaultValueHint")}
            optional
            clearable
          />
        ) : valueType === "list" ? (
          <SelectField
            control={form.control}
            name="defaultValue"
            label={t("products.fields.defaultValue")}
            hint={t("products.fields.defaultValueHint")}
            optional
            options={optionValues.map((option) => ({ value: option, label: option }))}
            clearLabel={t("products.fields.noDefault")}
            placeholder={t("products.fields.noDefault")}
          />
        ) : (
          <TextField
            control={form.control}
            name="defaultValue"
            label={t("products.fields.defaultValue")}
            hint={t("products.fields.defaultValueHint")}
            optional
          />
        )}

        <div className="flex flex-col gap-4 border-t pt-5">
          {valueType === "checkbox" ? null : (
            <SwitchField
              control={form.control}
              name="required"
              label={t("products.fields.required")}
              hint={t("products.fields.requiredHint")}
            />
          )}
          <SwitchField
            control={form.control}
            name="searchable"
            label={t("products.fields.searchable")}
            hint={t("products.fields.searchableHint")}
          />
        </div>

        {field ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("products.fields.key")}</p>
              <p className="truncate font-mono text-sm">{field.key}</p>
            </div>
            <CopyButton value={field.key} />
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
