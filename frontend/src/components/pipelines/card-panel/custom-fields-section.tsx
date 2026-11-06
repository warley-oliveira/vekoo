import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"
import { z } from "zod"

import {
  CheckboxField,
  ChipsField,
  FormActions,
  ResponsiveDialog,
  SelectField,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBoardHandle } from "@/hooks/pipelines/board-handle"
import { apiPost } from "@/lib/api"
import { isBlankValue } from "@/lib/pipelines/card-meta"
import { boardPath } from "@/lib/pipelines/paths"
import type { CardDetail, CustomField, CustomFieldType, Stage } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"
import { CustomFieldControl } from "./custom-field-control"

const FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "select", "checkbox", "url", "user"]

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      name: z.string().trim().min(1, t("pipelines.fields.nameRequired")).max(120),
      fieldType: z.enum(["text", "number", "date", "select", "checkbox", "url", "user"]),
      options: z.array(z.string()),
      required: z.boolean(),
    })
    .refine((values) => values.fieldType !== "select" || values.options.length > 0, {
      path: ["options"],
      message: t("pipelines.fields.optionsRequired"),
    })
}

/** Criar um campo sem sair do card. O resto (ordem, etapa, travas) fica nos ajustes do pipeline. */
function CreateFieldDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const handle = useBoardHandle()
  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", fieldType: "text", options: [], required: false },
    mode: "onBlur",
  })
  const fieldType = form.watch("fieldType")
  const { mutate } = useSWRConfig()

  const submit = useFormSubmit(form, async (values) => {
    await apiPost(`${boardPath(handle.boardId)}/custom-fields`, {
      customField: {
        name: values.name,
        fieldType: values.fieldType,
        required: values.required,
        options: values.fieldType === "select" ? values.options : null,
      },
    })
    toast.success(t("pipelines.fields.created"))
    handle.revalidate()
    void mutate(`${boardPath(handle.boardId)}/custom-fields`)
    form.reset()
    onOpenChange(false)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pipelines.fields.newTitle")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("pipelines.fields.create")}
          onCancel={() => onOpenChange(false)}
          cancelLabel={t("pipelines.actions.cancel")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          control={form.control}
          name="name"
          label={t("pipelines.fields.name")}
          placeholder={t("pipelines.fields.namePlaceholder")}
          autoFocus
        />
        <SelectField
          control={form.control}
          name="fieldType"
          label={t("pipelines.fields.type")}
          options={FIELD_TYPES.map((value) => ({
            value,
            label: t(`pipelines.fields.types.${value}`),
          }))}
        />
        {fieldType === "select" ? (
          <ChipsField
            control={form.control}
            name="options"
            label={t("pipelines.fields.options")}
            placeholder={t("pipelines.fields.optionsPlaceholder")}
          />
        ) : null}
        <CheckboxField
          control={form.control}
          name="required"
          label={t("pipelines.fields.required")}
          hint={t("pipelines.fields.requiredHint")}
        />
      </div>
    </ResponsiveDialog>
  )
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: CustomField
  value: unknown
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  const required = field.required || field.requiredToLeaveStage
  const id = `card-field-${field.id}`

  return (
    <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <label htmlFor={id} className="truncate text-sm text-muted-foreground">
        {field.name}
        {required ? (
          <span
            className="ml-0.5 text-status-danger"
            title={
              field.requiredToLeaveStage
                ? t("pipelines.fields.requiredToLeaveHint")
                : t("pipelines.fields.requiredHint")
            }
          >
            *
          </span>
        ) : null}
      </label>
      <div className="min-w-0">
        <CustomFieldControl id={id} field={field} value={value} onChange={onChange} />
      </div>
    </div>
  )
}

type CustomFieldsSectionProps = {
  card: CardDetail
  customFields: CustomField[]
  stages: Stage[]
  onChange: (key: string, value: unknown) => void
}

/**
 * Os campos do pipeline e os da etapa em que o card está. Vazios ficam recolhidos, a não ser os que
 * travam a saída da etapa: quem precisa preencher não pode ter que procurar.
 */
export function CustomFieldsSection({
  card,
  customFields,
  stages,
  onChange,
}: CustomFieldsSectionProps) {
  const { t } = useTranslation()
  const [showEmpty, setShowEmpty] = useState(false)
  const [creating, setCreating] = useState(false)

  const valueOf = (field: CustomField) =>
    card.customFieldValues?.[field.key] ?? field.defaultValue ?? null

  const relevant = customFields.filter((field) => {
    if (field.scope === "board") return true
    if (field.stageId === card.stageId) return true
    // De outra etapa, só se já tem o que mostrar.
    return !isBlankValue(card.customFieldValues?.[field.key])
  })

  const isFilled = (field: CustomField) => {
    const value = valueOf(field)
    return !isBlankValue(value) && value !== false
  }

  const boardFields = relevant.filter((field) => field.scope === "board")
  const stageFields = relevant.filter((field) => field.scope === "stage")
  const emptyCount = relevant.filter((field) => !isFilled(field)).length

  const shownBoard = showEmpty ? boardFields : boardFields.filter(isFilled)
  const shownStage = showEmpty
    ? stageFields
    : stageFields.filter((field) => isFilled(field) || field.requiredToLeaveStage)

  const stageName = stages.find((stage) => stage.id === card.stageId)?.name ?? ""

  return (
    <section aria-labelledby="card-fields-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-fields-title" className="text-sm font-medium">
          {t("pipelines.fields.title")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={() => setCreating(true)}
        >
          <Plus />
          {t("pipelines.fields.add")}
        </Button>
      </div>

      {relevant.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pipelines.fields.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shownBoard.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={valueOf(field)}
              onChange={(value) => onChange(field.key, value)}
            />
          ))}

          {shownStage.length > 0 ? (
            <p
              className={cn(
                "pt-1 text-xs font-medium text-muted-foreground",
                shownBoard.length > 0 && "border-t pt-3"
              )}
            >
              {t("pipelines.fields.ofStage", { name: stageName })}
            </p>
          ) : null}
          {shownStage.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={valueOf(field)}
              onChange={(value) => onChange(field.key, value)}
            />
          ))}

          {emptyCount > 0 ? (
            <div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0 pointer-coarse:h-10"
                onClick={() => setShowEmpty((current) => !current)}
              >
                {showEmpty
                  ? t("pipelines.fields.hideEmpty", { count: emptyCount })
                  : t("pipelines.fields.showEmpty", { count: emptyCount })}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <CreateFieldDialog open={creating} onOpenChange={setCreating} />
    </section>
  )
}
