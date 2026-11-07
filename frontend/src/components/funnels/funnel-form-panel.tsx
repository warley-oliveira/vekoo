import { useMemo } from "react"
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  FormActions,
  ResponsiveDialog,
  TextareaField,
  TextField,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { DragHandle, SortableArea } from "@/components/shared/sortable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useFunnelMutations } from "@/hooks/insights/use-funnels"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { MAX_STAGES } from "./board-state"
import type { Funnel } from "./types"

/** Os limites de `Funnel` e `FunnelStage`. */
const MAX_NAME = 80
const MAX_DESCRIPTION = 500
const MAX_STAGE_NAME = 60

const TEMPLATES = ["sales", "support", "booking"] as const

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t("funnels.form.nameRequired"))
        .max(MAX_NAME, t("funnels.form.nameTooLong", { max: MAX_NAME })),
      description: z.string().trim().max(MAX_DESCRIPTION, t("funnels.form.descriptionTooLong", { max: MAX_DESCRIPTION })),
      stages: z
        .array(
          z.object({
            stageId: z.string().nullable(),
            name: z
              .string()
              .trim()
              .min(1, t("funnels.form.stageRequired"))
              .max(MAX_STAGE_NAME, t("funnels.form.stageTooLong", { max: MAX_STAGE_NAME })),
          })
        )
        .min(1, t("funnels.form.stagesRequired"))
        .max(MAX_STAGES, t("funnels.form.tooManyStages", { max: MAX_STAGES })),
    })
    .superRefine((values, context) => {
      const seen = new Set<string>()
      values.stages.forEach((stage, index) => {
        const key = stage.name.trim().toLocaleLowerCase()
        if (key && seen.has(key)) {
          context.addIssue({
            code: "custom",
            path: ["stages", index, "name"],
            message: t("funnels.form.stageDuplicate"),
          })
        }
        seen.add(key)
      })
    })
}

type FunnelValues = z.infer<ReturnType<typeof buildSchema>>

type FunnelFormPanelProps = {
  /** Sem funil, o painel cria. */
  funnel: Funnel | null
  /** Quantas conversas cada etapa tem agora, para avisar antes de excluir. */
  stageCounts: Record<string, number>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (funnel: Funnel) => void
  onDelete?: (funnel: Funnel) => void
}

/** Criar e editar um funil: o nome e as etapas, numa folha só, porque a API grava a lista inteira. */
export function FunnelFormPanel({ funnel, stageCounts, open, onOpenChange, onSaved, onDelete }: FunnelFormPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { createFunnel, updateFunnel } = useFunnelMutations()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<FunnelValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: funnel?.name ?? "",
      description: funnel?.description ?? "",
      stages: funnel
        ? funnel.stages.map((stage) => ({ stageId: stage.id, name: stage.name }))
        : (t("funnels.templates.sales.stages", { returnObjects: true }) as string[]).map((name) => ({
            stageId: null,
            name,
          })),
    },
    mode: "onBlur",
  })

  const { fields, append, remove, move, replace, insert } = useFieldArray({
    control: form.control,
    name: "stages",
    keyName: "key",
  })

  const close = () => onOpenChange(false)
  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const removedStages = useMemo(() => {
    if (!funnel) return []
    const kept = new Set(fields.map((field) => field.stageId))
    return funnel.stages.filter((stage) => !kept.has(stage.id))
  }, [fields, funnel])

  const submit = useFormSubmit(form, async (values) => {
    const stages = values.stages.map((stage) => ({ ...(stage.stageId ? { id: stage.stageId } : {}), name: stage.name }))

    if (funnel) {
      if (removedStages.length > 0) {
        const chats = removedStages.reduce((sum, stage) => sum + (stageCounts[stage.id] ?? 0), 0)
        const confirmed = await confirm({
          title: t("funnels.form.removedTitle", { count: removedStages.length }),
          description: t(chats > 0 ? "funnels.form.removedHint" : "funnels.form.removedHintEmpty", {
            count: chats,
            names: new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
              removedStages.map((stage) => stage.name)
            ),
          }),
          confirmLabel: t("funnels.form.removedConfirm", { count: removedStages.length }),
          destructive: true,
        })
        if (!confirmed) return
      }
      const saved = await updateFunnel(funnel.id, {
        name: values.name,
        description: values.description || null,
        stages,
      })
      form.reset(values)
      toast.success(t("funnels.edit.done", { name: saved.name }))
      onSaved(saved)
    } else {
      const saved = await createFunnel({ name: values.name, description: values.description || null, stages })
      form.reset(values)
      toast.success(t("funnels.create.done", { name: saved.name }))
      onSaved(saved)
    }
    close()
  })

  const stageError = form.formState.errors.stages
  const listError = stageError?.root?.message ?? stageError?.message

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={funnel ? t("funnels.edit.title", { name: funnel.name }) : t("funnels.create.title")}
      description={funnel ? undefined : t("funnels.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={funnel ? t("funnels.edit.submit") : t("funnels.create.submit")}
          onCancel={close}
          requireChanges={Boolean(funnel)}
          secondary={
            funnel && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(funnel)}
              >
                <Trash2 />
                {t("funnels.delete.action")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <TextField
          control={form.control}
          name="name"
          label={t("funnels.form.name")}
          placeholder={t("funnels.form.namePlaceholder")}
          autoFocus
        />
        <TextareaField
          control={form.control}
          name="description"
          label={t("funnels.form.description")}
          optional
        />

        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-medium">{t("funnels.form.stages")}</h3>
            <p className="text-xs text-pretty text-muted-foreground">{t("funnels.form.stagesHint")}</p>
          </div>

          {!funnel ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("funnels.templates.label")}</span>
              {TEMPLATES.map((template) => (
                <Button
                  key={template}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="pointer-coarse:h-8"
                  onClick={() =>
                    replace(
                      (t(`funnels.templates.${template}.stages`, { returnObjects: true }) as string[]).map((name) => ({
                        stageId: null,
                        name,
                      }))
                    )
                  }
                >
                  {t(`funnels.templates.${template}.name`)}
                </Button>
              ))}
            </div>
          ) : null}

          <StageList
            form={form}
            fields={fields}
            onRemove={remove}
            onMove={move}
            onInsert={(index) => insert(index, { stageId: null, name: "" }, { shouldFocus: true })}
          />

          {listError ? (
            <p role="alert" className="text-xs text-destructive">
              {listError}
            </p>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground pointer-coarse:h-10"
            disabled={fields.length >= MAX_STAGES}
            onClick={() => append({ stageId: null, name: "" }, { shouldFocus: true })}
          >
            <Plus />
            {t("funnels.stage.add")}
          </Button>

          {removedStages.map((stage) => (
            <Callout
              key={stage.id}
              tone="warning"
              title={t(stageCounts[stage.id] ? "funnels.form.removedStage" : "funnels.form.removedStageEmpty", {
                name: stage.name,
                count: stageCounts[stage.id] ?? 0,
              })}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const original = funnel?.stages.findIndex((entry) => entry.id === stage.id) ?? 0
                    insert(Math.min(original, fields.length), { stageId: stage.id, name: stage.name })
                  }}
                >
                  <Undo2 />
                  {t("funnels.form.undoRemove")}
                </Button>
              }
            />
          ))}
        </div>
      </div>
    </ResponsiveDialog>
  )
}

type StageField = FunnelValues["stages"][number] & { key: string }

type StageListProps = {
  form: UseFormReturn<FunnelValues>
  fields: StageField[]
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onInsert: (index: number) => void
}

function StageList({ form, fields, onRemove, onMove, onInsert }: StageListProps) {
  const { t } = useTranslation()
  const items = useMemo(() => fields.map((field) => ({ ...field, id: field.key })), [fields])
  const stageErrors = form.formState.errors.stages

  return (
    <SortableArea
      items={items}
      nameOf={(item) => form.getValues(`stages.${items.indexOf(item)}.name`) || t("funnels.form.newStage")}
      onReorder={(ordered) => {
        const first = ordered.findIndex((item, index) => item.id !== items[index].id)
        if (first < 0) return
        const movedUp = items.findIndex((item) => item.id === ordered[first].id)
        // Veio de longe, subiu. Senão, quem estava aqui é que desceu.
        if (movedUp > first + 1) onMove(movedUp, first)
        else onMove(first, ordered.findIndex((item) => item.id === items[first].id))
      }}
    >
      <ol className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <StageRow
            key={item.id}
            id={item.id}
            index={index}
            total={items.length}
            form={form}
            error={stageErrors?.[index]?.name?.message}
            onRemove={() => onRemove(index)}
            onEnter={() => onInsert(index + 1)}
          />
        ))}
      </ol>
    </SortableArea>
  )
}

type StageRowProps = {
  id: string
  index: number
  total: number
  form: UseFormReturn<FunnelValues>
  error?: string
  onRemove: () => void
  onEnter: () => void
}

function StageRow({ id, index, total, form, error, onRemove, onEnter }: StageRowProps) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps, isDragging } = useSortableEntry(id)
  const position = index + 1

  return (
    <li ref={setNodeRef} style={style} className={cn("rounded-lg bg-popover", isDragging && "shadow-md")}>
      <div className="flex items-center gap-1">
        <DragHandle {...handleProps} label={t("funnels.form.dragStage", { position })} />
        <span aria-hidden className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
          {position}
        </span>
        <Input
          {...form.register(`stages.${index}.name`)}
          aria-label={t("funnels.form.stageName", { position })}
          aria-invalid={Boolean(error)}
          placeholder={t("funnels.form.stagePlaceholder")}
          maxLength={MAX_STAGE_NAME}
          className="min-w-0 flex-1"
          onKeyDown={(event) => {
            // Enter cria a próxima, para digitar as etapas de uma vez, sem tirar a mão do teclado.
            if (event.key === "Enter") {
              event.preventDefault()
              if (total < MAX_STAGES) onEnter()
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("funnels.form.removeStage", { position })}
          className="text-muted-foreground"
          disabled={total <= 1}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      {error ? <p className="mt-1 pl-14 text-xs text-destructive">{error}</p> : null}
    </li>
  )
}
