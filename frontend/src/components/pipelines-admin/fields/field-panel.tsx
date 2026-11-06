import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { CalendarDays, Lock } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ChipsField,
  FormActions,
  RadioField,
  SelectField,
  SidePanel,
  StatusBadge,
  SwitchField,
  TextField,
  UnsavedChangesDialog,
  UserAvatar,
  useFormSubmit,
} from "@/components/shared"
import { useCustomFieldMutations } from "@/hooks/pipelines-admin/use-custom-fields"
import { useGuardedClose } from "@/hooks/use-panel-session"
import {
  CUSTOM_FIELD_TYPES,
  type Board,
  type CustomField,
  type CustomFieldType,
} from "@/lib/pipelines-admin/types"
import { FIELD_TYPE_ICONS } from "./field-types"

const NAME_MAX = 120

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t("pipelinesAdmin.fields.form.nameRequired"))
        .max(NAME_MAX, t("pipelinesAdmin.fields.form.nameTooLong")),
      fieldType: z.enum(CUSTOM_FIELD_TYPES),
      options: z.array(z.string()),
      required: z.boolean(),
      scope: z.enum(["board", "stage"]),
      stageId: z.string().nullable(),
      requiredToLeaveStage: z.boolean(),
    })
    .refine((values) => values.fieldType !== "select" || values.options.length > 0, {
      path: ["options"],
      message: t("pipelinesAdmin.fields.form.optionsRequired"),
    })
    .refine((values) => values.scope !== "stage" || Boolean(values.stageId), {
      path: ["stageId"],
      message: t("pipelinesAdmin.fields.form.stageRequired"),
    })
}

type FieldValues = z.infer<ReturnType<typeof buildSchema>>

type FieldPanelProps = {
  board: Board
  /** Sem campo, o painel cria. */
  field: CustomField | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FieldPanel({ board, field, open, onOpenChange }: FieldPanelProps) {
  const { t } = useTranslation()
  const { createField, updateField } = useCustomFieldMutations(board.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: field?.name ?? "",
      fieldType: field?.fieldType ?? "text",
      options: field?.options ?? [],
      required: field?.required ?? false,
      scope: field?.scope ?? "board",
      stageId: field?.stageId ?? null,
      requiredToLeaveStage: field?.requiredToLeaveStage ?? false,
    },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const input = {
      name: values.name.trim(),
      required: values.required,
      options: values.fieldType === "select" ? values.options : null,
      scope: values.scope,
      stageId: values.scope === "stage" ? values.stageId : null,
      requiredToLeaveStage: values.scope === "stage" ? values.requiredToLeaveStage : false,
    }

    if (field) {
      await updateField(field.id, input)
      toast.success(t("pipelinesAdmin.fields.saved", { name: input.name }))
    } else {
      await createField({ ...input, fieldType: values.fieldType })
      toast.success(t("pipelinesAdmin.fields.created", { name: input.name }))
    }
    form.reset(values)
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const name = useWatch({ control: form.control, name: "name" })
  const fieldType = useWatch({ control: form.control, name: "fieldType" })
  const options = useWatch({ control: form.control, name: "options" })
  const scope = useWatch({ control: form.control, name: "scope" })

  const typeOptions = useMemo(
    () =>
      CUSTOM_FIELD_TYPES.map((type) => {
        const Icon = FIELD_TYPE_ICONS[type]
        return {
          value: type,
          label: t(`pipelinesAdmin.fields.types.${type}`),
          icon: <Icon className="size-4 text-muted-foreground" />,
        }
      }),
    [t]
  )

  const stageOptions = useMemo(
    () => board.stages.map((stage) => ({ value: stage.id, label: stage.name })),
    [board.stages]
  )

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={field?.name ?? t("pipelinesAdmin.fields.form.createTitle")}
      description={field ? undefined : t("pipelinesAdmin.fields.form.createDescription")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={field ? t("pipelinesAdmin.fields.form.submitEdit") : t("pipelinesAdmin.fields.form.submitCreate")}
          onCancel={close}
          requireChanges={Boolean(field)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <TextField
          control={form.control}
          name="name"
          label={t("pipelinesAdmin.fields.form.name")}
          placeholder={t("pipelinesAdmin.fields.form.namePlaceholder")}
          autoComplete="off"
          autoFocus={!field}
          maxLength={NAME_MAX}
        />

        {/* O valor fica no card pela chave do campo: trocar o tipo deixaria dados que não servem. */}
        <SelectField
          control={form.control}
          name="fieldType"
          label={t("pipelinesAdmin.fields.form.type")}
          hint={
            field ? (
              <span className="inline-flex items-center gap-1">
                <Lock aria-hidden className="size-3" />
                {t("pipelinesAdmin.fields.form.typeLocked")}
              </span>
            ) : undefined
          }
          options={typeOptions}
          disabled={Boolean(field)}
        />

        {fieldType === "select" ? (
          <ChipsField
            control={form.control}
            name="options"
            label={t("pipelinesAdmin.fields.form.options")}
            hint={t("pipelinesAdmin.fields.form.optionsHint")}
            placeholder={t("pipelinesAdmin.fields.form.optionsPlaceholder")}
          />
        ) : null}

        <RadioField
          control={form.control}
          name="scope"
          label={t("pipelinesAdmin.fields.form.scope")}
          variant="cards"
          options={[
            {
              value: "board",
              label: t("pipelinesAdmin.fields.form.scopeBoard"),
              description: t("pipelinesAdmin.fields.form.scopeBoardHint"),
            },
            {
              value: "stage",
              label: t("pipelinesAdmin.fields.form.scopeStage"),
              description: t("pipelinesAdmin.fields.form.scopeStageHint"),
            },
          ]}
        />

        {scope === "stage" ? (
          <div className="flex flex-col gap-4">
            <SelectField
              control={form.control}
              name="stageId"
              label={t("pipelinesAdmin.fields.form.stage")}
              options={stageOptions}
              placeholder={t("pipelinesAdmin.fields.form.stagePlaceholder")}
            />
            <SwitchField
              control={form.control}
              name="requiredToLeaveStage"
              label={t("pipelinesAdmin.fields.form.requiredToLeave")}
              hint={t("pipelinesAdmin.fields.form.requiredToLeaveHint")}
            />
          </div>
        ) : null}

        {board.boardType === "crm" ? (
          <SwitchField
            control={form.control}
            name="required"
            label={t("pipelinesAdmin.fields.form.required")}
            hint={t("pipelinesAdmin.fields.form.requiredHint")}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("pipelinesAdmin.fields.form.preview")}</span>
          <div className="rounded-lg bg-muted/40 p-3">
            <FieldPreview name={name} type={fieldType} options={options} />
          </div>
        </div>
      </div>
    </SidePanel>
  )
}

/** Como o campo aparece no card: dá para bater o olho antes de criar. */
function FieldPreview({
  name,
  type,
  options,
}: {
  name: string
  type: CustomFieldType
  options: string[]
}) {
  const { t } = useTranslation()
  const label = name.trim() || t("pipelinesAdmin.fields.form.previewName")

  if (type === "checkbox") {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span aria-hidden className="size-4 rounded border border-input bg-background" />
        {label}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {type === "select" ? (
        <StatusBadge tone="neutral" className="self-start">
          {options[0] ?? t("pipelinesAdmin.fields.form.previewOption")}
        </StatusBadge>
      ) : type === "date" ? (
        <span className="flex items-center gap-1.5 text-sm tabular-nums">
          <CalendarDays aria-hidden className="size-3.5 text-muted-foreground" />
          {new Intl.DateTimeFormat(undefined, { dateStyle: "short" }).format(new Date())}
        </span>
      ) : type === "url" ? (
        <span className="text-sm underline underline-offset-2">{t("pipelinesAdmin.fields.form.previewUrl")}</span>
      ) : type === "user" ? (
        <span className="flex items-center gap-1.5 text-sm">
          <UserAvatar name={t("pipelinesAdmin.fields.form.previewPerson")} size="xs" />
          {t("pipelinesAdmin.fields.form.previewPerson")}
        </span>
      ) : type === "number" ? (
        <span className="text-sm tabular-nums">{t("pipelinesAdmin.fields.form.previewNumber")}</span>
      ) : (
        <span className="text-sm">{t("pipelinesAdmin.fields.form.previewText")}</span>
      )}
    </div>
  )
}
