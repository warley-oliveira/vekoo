import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ColorField,
  FormActions,
  NumberField,
  ResponsiveDialog,
  TagChip,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useStageMutations } from "@/hooks/pipelines-admin/use-board"
import { useGuardedClose } from "@/hooks/use-panel-session"
import type { CustomField, Stage } from "@/lib/pipelines-admin/types"
import { StageChecklistEditor } from "./stage-checklist-editor"

const NAME_MAX = 120

function buildSchema(t: (key: string) => string) {
  const positive = z
    .number()
    .int(t("pipelinesAdmin.stages.fields.wholeNumber"))
    .min(1, t("pipelinesAdmin.stages.fields.wholeNumber"))
    .nullable()

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("pipelinesAdmin.stages.fields.nameRequired"))
      .max(NAME_MAX, t("pipelinesAdmin.stages.fields.nameTooLong")),
    color: z.string().nullable(),
    wipLimit: positive,
    slaHours: positive,
  })
}

type StageValues = z.infer<ReturnType<typeof buildSchema>>

type StagePanelProps = {
  boardId: string
  /** Sem etapa, o painel cria. */
  stage: Stage | null
  /** Todos os do quadro: o painel mostra os que são só desta etapa. */
  customFields: CustomField[]
  open: boolean
  canDelete: boolean
  onOpenChange: (open: boolean) => void
  /** Criou: o painel continua aberto na etapa nova, para já montar o checklist. */
  onCreated: (stage: Stage) => void
  onDelete: (stage: Stage) => void
}

/** Quem edita uma etapa quer saber o que ela pede a mais. Os campos em si moram na aba Campos. */
function StageFields({
  boardId,
  stageId,
  fields,
}: {
  boardId: string
  stageId: string
  fields: CustomField[]
}) {
  const { t } = useTranslation()
  const base = `/pipelines/${boardId}/settings/fields`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{t("pipelinesAdmin.stages.stageFields.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {fields.length > 0
            ? t("pipelinesAdmin.stages.stageFields.hint")
            : t("pipelinesAdmin.stages.stageFields.empty")}
        </p>
      </div>
      {fields.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {fields.map((field) => (
            <li key={field.id}>
              <Link
                to={`${base}?field=${field.id}`}
                className="block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <TagChip className="hover:bg-accent">{field.name}</TagChip>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="-ml-2 self-start pointer-coarse:h-10"
        render={<Link to={`${base}?field=new&stage=${stageId}`} />}
      >
        <Plus />
        {t("pipelinesAdmin.stages.stageFields.create")}
      </Button>
    </div>
  )
}

/** Criar, renomear e o que vale dentro da etapa, tudo no mesmo lugar. */
export function StagePanel({
  boardId,
  stage,
  customFields,
  open,
  canDelete,
  onOpenChange,
  onCreated,
  onDelete,
}: StagePanelProps) {
  const { t } = useTranslation()
  const { createStage, updateStage } = useStageMutations(boardId)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<StageValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: stage?.name ?? "",
      color: stage?.color ?? null,
      wipLimit: stage?.wipLimit ?? null,
      slaHours: stage?.slaHours ?? null,
    },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const input = { ...values, name: values.name.trim() }
    if (stage) {
      await updateStage(stage.id, input)
      form.reset(input)
      toast.success(t("pipelinesAdmin.stages.saved", { name: input.name }))
      close()
    } else {
      const created = await createStage(input)
      form.reset(input)
      toast.success(t("pipelinesAdmin.stages.created", { name: created.name }))
      onCreated(created)
    }
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)
  const color = form.watch("color")

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={stage?.name ?? t("pipelinesAdmin.stages.createTitle")}
      description={stage ? undefined : t("pipelinesAdmin.stages.createDescription")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={stage ? t("pipelinesAdmin.stages.submitEdit") : t("pipelinesAdmin.stages.submitCreate")}
          onCancel={close}
          cancelLabel={stage ? t("pipelinesAdmin.common.close") : undefined}
          requireChanges={Boolean(stage)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="name"
            label={t("pipelinesAdmin.stages.fields.name")}
            placeholder={t("pipelinesAdmin.stages.fields.namePlaceholder")}
            autoComplete="off"
            autoFocus={!stage}
            maxLength={NAME_MAX}
          />
          <ColorField
            control={form.control}
            name="color"
            label={t("pipelinesAdmin.stages.fields.color")}
            placeholder={t("pipelinesAdmin.stages.fields.noColor")}
            optional
            action={
              color ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-xs"
                  onClick={() => form.setValue("color", null, { shouldDirty: true })}
                >
                  {t("pipelinesAdmin.stages.fields.clearColor")}
                </Button>
              ) : undefined
            }
          />
          <NumberField
            control={form.control}
            name="slaHours"
            label={t("pipelinesAdmin.stages.fields.slaHours")}
            hint={t("pipelinesAdmin.stages.fields.slaHoursHint")}
            placeholder={t("pipelinesAdmin.stages.fields.noLimit")}
            optional
            min={1}
          />
          <NumberField
            control={form.control}
            name="wipLimit"
            label={t("pipelinesAdmin.stages.fields.wipLimit")}
            hint={t("pipelinesAdmin.stages.fields.wipLimitHint")}
            placeholder={t("pipelinesAdmin.stages.fields.noLimit")}
            optional
            min={1}
          />
        </div>

        {stage ? (
          <div className="border-t pt-5">
            <StageChecklistEditor boardId={boardId} stageId={stage.id} />
          </div>
        ) : null}

        {stage ? (
          <div className="border-t pt-5">
            <StageFields
              boardId={boardId}
              stageId={stage.id}
              fields={customFields.filter((field) => field.stageId === stage.id)}
            />
          </div>
        ) : null}

        {stage && canDelete ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(stage)}
            >
              <Trash2 />
              {t("pipelinesAdmin.stages.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
