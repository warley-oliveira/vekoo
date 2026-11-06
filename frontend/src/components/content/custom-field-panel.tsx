import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useWatch, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trans, useTranslation } from "react-i18next"
import { BarChart3, Lock, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  ChipsField,
  ChipsInput,
  CopyButton,
  DatePicker,
  Field,
  FormActions,
  FormField,
  NumberInput,
  RadioField,
  SelectField,
  SidePanel,
  SwitchField,
  TextareaField,
  TextField,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCustomFieldMutations } from "@/hooks/content/use-custom-fields"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { contentErrorMessage } from "@/lib/content/error-message"
import { deriveCustomFieldKey } from "@/lib/content/normalization"
import {
  NORMALIZATION_STRATEGIES,
  VALUE_TYPES,
  type CustomField,
  type CustomFieldInput,
} from "@/lib/content/types"
import { toDateInputValue } from "@/lib/date-format"
import { normalizeSearchText } from "@/lib/search-text"
import { FieldTypeIcon } from "./field-type-icon"

type CustomFieldPanelProps = {
  /** Sem campo, o painel cria. */
  field: CustomField | null
  /** Todos os da organização: a chave repetida e o destino da normalização vêm daqui. */
  allFields: CustomField[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (field: CustomField) => void
  onOpenValues: (field: CustomField) => void
}

function buildSchema(
  t: (key: string, options?: Record<string, unknown>) => string,
  field: CustomField | null,
  allFields: CustomField[]
) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t("content.customFields.fields.nameRequired"))
        .max(255, t("content.customFields.fields.nameTooLong"))
        .refine(
          (value) => deriveCustomFieldKey(value) !== "",
          t("content.customFields.fields.nameNeedsLetters")
        ),
      description: z
        .string()
        .max(500, t("content.customFields.fields.descriptionTooLong"))
        .nullable(),
      valueType: z.enum(VALUE_TYPES),
      optionValues: z.array(z.string()),
      defaultValue: z.string().nullable(),
      autoNormalize: z.boolean(),
      normalizationStrategy: z.enum(NORMALIZATION_STRATEGIES),
      normalizationTargetKey: z.string().nullable(),
    })
    .superRefine((values, context) => {
      if (!field) {
        const key = deriveCustomFieldKey(values.name)
        const taken = allFields.find((other) => other.key === key)
        if (key && taken) {
          context.addIssue({
            code: "custom",
            path: ["name"],
            message: t("content.customFields.fields.keyTaken", { name: taken.name, key }),
          })
        }
      }
      // Campo que já é lista cuida das opções na hora, fora do formulário.
      const managedLive = field?.valueType === "list"
      if (values.valueType === "list" && !managedLive && values.optionValues.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["optionValues"],
          message: t("content.customFields.fields.optionsRequired"),
        })
      }
    })
}

type CustomFieldValues = z.infer<ReturnType<typeof buildSchema>>

function initialValues(field: CustomField | null): CustomFieldValues {
  return {
    name: field?.name ?? "",
    description: field?.description ?? "",
    valueType: field?.valueType ?? "text",
    optionValues: field?.optionValues ?? [],
    defaultValue: field?.defaultValue || null,
    autoNormalize: field?.autoNormalize ?? false,
    normalizationStrategy: field?.normalizationStrategy ?? "min",
    normalizationTargetKey: field?.normalizationTargetKey || null,
  }
}

function buildPayload(values: CustomFieldValues, field: CustomField | null): CustomFieldInput {
  const isList = values.valueType === "list"
  const isNumber = values.valueType === "number"
  const managedLive = field?.valueType === "list" && isList

  return {
    name: values.name,
    description: values.description?.trim() || null,
    valueType: values.valueType,
    defaultValue: values.defaultValue || null,
    // Fora do envio quando já é lista: regravar apagaria a opção que outra pessoa acabou de criar.
    ...(managedLive ? {} : { optionValues: isList ? values.optionValues : [] }),
    autoNormalize: isNumber && values.autoNormalize,
    normalizationStrategy: values.normalizationStrategy,
    normalizationTargetKey: isNumber && values.autoNormalize ? values.normalizationTargetKey : null,
  }
}

/** "1989-03-14" no fuso de quem digitou: o valor do campo é só o dia, sem hora. */
function parseDay(value: string | null): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

/** Criar e editar um campo: nome, tipo, opções, valor padrão e normalização ao gravar. */
export function CustomFieldPanel({
  field,
  allFields,
  open,
  onOpenChange,
  onDelete,
  onOpenValues,
}: CustomFieldPanelProps) {
  const { t } = useTranslation()
  const { createCustomField, updateCustomField } = useCustomFieldMutations()

  const schema = useMemo(() => buildSchema(t, field, allFields), [allFields, field, t])
  const form = useForm<CustomFieldValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(field),
    mode: "onBlur",
  })

  const name = useWatch({ control: form.control, name: "name" })
  const valueType = useWatch({ control: form.control, name: "valueType" })
  const optionValues = useWatch({ control: form.control, name: "optionValues" })
  const autoNormalize = useWatch({ control: form.control, name: "autoNormalize" })

  // Trocar de tipo invalida o padrão e as opções: "M" não é data, e número não tem lista.
  const previousType = useRef(valueType)
  useEffect(() => {
    if (previousType.current === valueType) return
    previousType.current = valueType
    form.setValue("defaultValue", null, { shouldDirty: true })
    if (valueType !== "list") form.setValue("optionValues", [], { shouldDirty: true })
  }, [form, valueType])

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const payload = buildPayload(values, field)
    const saved = field
      ? await updateCustomField(field.id, payload)
      : await createCustomField(payload)
    form.reset(initialValues(saved))
    previousType.current = saved.valueType
    toast.success(
      t(field ? "content.customFields.saved" : "content.customFields.created", {
        name: saved.name,
      })
    )
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const derivedKey = deriveCustomFieldKey(name ?? "")
  const managedLive = field?.valueType === "list" && valueType === "list"
  const listOptions = managedLive && field ? field.optionValues : optionValues
  const losingOptions = field?.valueType === "list" && valueType !== "list"

  const typeOptions = VALUE_TYPES.map((type) => ({
    value: type,
    label: t(`content.customFields.types.${type}`),
    description: t(`content.customFields.typeHints.${type}`),
    icon: <FieldTypeIcon type={type} />,
  }))

  const targetOptions = allFields
    .filter((other) => other.valueType === "number" && other.id !== field?.id)
    .map((other) => ({ value: other.key, label: other.name }))

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="lg"
      title={field?.name ?? t("content.customFields.create.title")}
      description={field ? undefined : t("content.customFields.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(field ? "content.customFields.edit.submit" : "content.customFields.create.submit")}
          onCancel={close}
          cancelLabel={field ? t("content.common.close") : undefined}
          requireChanges={Boolean(field)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <TextField
          control={form.control}
          name="name"
          label={t("content.customFields.fields.name")}
          placeholder={t("content.customFields.fields.namePlaceholder")}
          autoComplete="off"
          autoFocus={!field}
          hint={
            field ? undefined : derivedKey ? (
              <Trans
                i18nKey="content.customFields.fields.keyPreview"
                values={{ key: derivedKey }}
                components={{ code: <code className="font-mono text-foreground" /> }}
              />
            ) : (
              t("content.customFields.fields.keyEmptyHint")
            )
          }
        />

        {field ? (
          <Callout
            icon={<Lock />}
            title={
              <span className="flex items-center gap-1">
                <code className="min-w-0 truncate font-mono text-sm">{field.key}</code>
                <CopyButton value={field.key} className="shrink-0" />
              </span>
            }
          >
            {t("content.customFields.fields.keyLocked", { variable: `{{${field.key}}}` })}
          </Callout>
        ) : null}

        <TextareaField
          control={form.control}
          name="description"
          label={t("content.customFields.fields.description")}
          placeholder={t("content.customFields.fields.descriptionPlaceholder")}
          optional
          rows={2}
          maxLength={500}
        />

        <RadioField
          control={form.control}
          name="valueType"
          label={t("content.customFields.fields.type")}
          options={typeOptions}
          variant="cards"
          orientation="horizontal"
          hint={field ? t("content.customFields.fields.typeChangeHint") : undefined}
        />

        {valueType === "list" ? (
          managedLive && field ? (
            <LiveOptions field={field} form={form} />
          ) : (
            <ChipsField
              control={form.control}
              name="optionValues"
              label={t("content.customFields.fields.options")}
              placeholder={t("content.customFields.fields.optionsPlaceholder")}
              hint={t("content.customFields.fields.optionsHint")}
            />
          )
        ) : null}

        {losingOptions ? (
          <Callout tone="warning">{t("content.customFields.fields.losingOptions")}</Callout>
        ) : null}

        {valueType === "number" ? (
          <div className="flex flex-col gap-4 rounded-lg bg-muted/60 p-3">
            <SwitchField
              control={form.control}
              name="autoNormalize"
              label={t("content.customFields.fields.autoNormalize")}
              hint={t("content.customFields.fields.autoNormalizeHint")}
            />
            {autoNormalize ? (
              <>
                <SelectField
                  control={form.control}
                  name="normalizationStrategy"
                  label={t("content.customFields.fields.strategy")}
                  options={NORMALIZATION_STRATEGIES.map((strategy) => ({
                    value: strategy,
                    label: t(`content.customFields.strategies.${strategy}`),
                  }))}
                />
                <SelectField
                  control={form.control}
                  name="normalizationTargetKey"
                  label={t("content.customFields.fields.target")}
                  options={targetOptions}
                  clearLabel={t("content.customFields.fields.targetSame")}
                  placeholder={t("content.customFields.fields.targetSame")}
                  hint={t("content.customFields.fields.targetHint")}
                />
              </>
            ) : null}
          </div>
        ) : null}

        <DefaultValueField control={form.control} valueType={valueType} options={listOptions} />

        {field ? (
          <div className="flex flex-wrap items-center gap-1 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground pointer-coarse:h-10"
              onClick={() => onOpenValues(field)}
            >
              <BarChart3 />
              {t("content.customFields.actions.values")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(field)}
            >
              <Trash2 />
              {t("content.customFields.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}

/** O controle do valor padrão muda com o tipo: o valor em si é sempre texto. */
function DefaultValueField({
  control,
  valueType,
  options,
}: {
  control: Control<CustomFieldValues>
  valueType: CustomFieldValues["valueType"]
  options: string[]
}) {
  const { t } = useTranslation()
  const label = t("content.customFields.fields.defaultValue")
  const hint = t("content.customFields.fields.defaultValueHint")
  const none = t("content.customFields.fields.noDefaultValue")

  switch (valueType) {
    case "list":
      return (
        <SelectField
          control={control}
          name="defaultValue"
          label={label}
          hint={options.length > 0 ? hint : t("content.customFields.fields.defaultNeedsOptions")}
          optional
          disabled={options.length === 0}
          options={options.map((option) => ({ value: option, label: option }))}
          clearLabel={none}
          placeholder={none}
        />
      )
    case "checkbox":
      return (
        <SelectField
          control={control}
          name="defaultValue"
          label={label}
          hint={hint}
          optional
          options={[
            { value: "true", label: t("content.customFields.checkbox.true") },
            { value: "false", label: t("content.customFields.checkbox.false") },
          ]}
          clearLabel={none}
          placeholder={none}
        />
      )
    case "number":
      return (
        <FormField control={control} name="defaultValue" label={label} hint={hint} optional>
          {({ field, controlProps }) => (
            <NumberInput
              {...controlProps}
              inputRef={field.ref}
              value={field.value === null || field.value === "" ? null : Number(field.value)}
              onChange={(next) => field.onChange(next === null ? null : String(next))}
              onBlur={field.onBlur}
              placeholder={none}
            />
          )}
        </FormField>
      )
    case "date":
      return (
        <FormField control={control} name="defaultValue" label={label} hint={hint} optional>
          {({ field, controlProps }) => (
            <DatePicker
              {...controlProps}
              triggerRef={field.ref}
              label={label}
              clearable
              placeholder={none}
              value={parseDay(field.value)}
              onChange={(next) => field.onChange(next ? toDateInputValue(next) : null)}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      )
    default:
      return (
        <TextField
          control={control}
          name="defaultValue"
          label={label}
          hint={hint}
          optional
          autoComplete="off"
          placeholder={none}
        />
      )
  }
}

/**
 * As opções de um campo que já é lista valem na hora, sem esperar o salvar: acrescentar passa
 * pela rota própria, e assim duas pessoas ao mesmo tempo não apagam a opção uma da outra.
 */
function LiveOptions({
  field,
  form,
}: {
  field: CustomField
  form: ReturnType<typeof useForm<CustomFieldValues>>
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { addOption, updateCustomField } = useCustomFieldMutations()
  const [pending, setPending] = useState<string[]>([])

  const known = new Set(field.optionValues.map(normalizeSearchText))
  const shown = [
    ...field.optionValues,
    ...pending.filter((value) => !known.has(normalizeSearchText(value))),
  ]

  async function add(values: string[]) {
    setPending((current) => [...current, ...values])
    try {
      for (const value of values) await addOption(field.id, value)
      toast.success(t("content.customFields.options.added", { count: values.length }))
    } catch (cause) {
      toast.error(contentErrorMessage(t, cause))
    } finally {
      setPending((current) => current.filter((value) => !values.includes(value)))
    }
  }

  async function remove(value: string) {
    const removingDefault = field.defaultValue === value
    const confirmed = await confirm({
      title: t("content.customFields.options.removeTitle", { value }),
      description: t(
        removingDefault
          ? "content.customFields.options.removeDefaultDescription"
          : "content.customFields.options.removeDescription"
      ),
      confirmLabel: t("content.customFields.options.removeConfirm"),
      destructive: true,
      onConfirm: async () => {
        await updateCustomField(field.id, {
          optionValues: field.optionValues.filter((option) => option !== value),
          ...(removingDefault ? { defaultValue: null } : {}),
        })
      },
    })
    if (!confirmed) return
    if (removingDefault) form.resetField("defaultValue", { defaultValue: null })
    toast.success(t("content.customFields.options.removed", { value }))
  }

  return (
    <Field
      label={t("content.customFields.fields.options")}
      hint={t("content.customFields.fields.optionsLiveHint")}
    >
      {(controlProps) => (
        <ChipsInput
          {...controlProps}
          value={shown}
          placeholder={t("content.customFields.fields.optionsPlaceholder")}
          onChange={(next) => {
            const added = next.filter((value) => !shown.includes(value))
            const removed = shown.filter((value) => !next.includes(value))
            if (added.length > 0) void add(added)
            removed.forEach((value) => void remove(value))
          }}
        />
      )}
    </Field>
  )
}
