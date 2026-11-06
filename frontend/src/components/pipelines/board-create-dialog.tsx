import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, SquareKanban, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  RadioField,
  ResponsiveDialog,
  TextField,
  TextareaField,
  useFormSubmit,
} from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { useBoardMutations, useBoardTemplates } from "@/hooks/pipelines/use-boards"
import { boardIcon } from "@/lib/pipelines/board-icons"
import { boardViewUrl } from "@/lib/pipelines/paths"
import type { BoardTemplate, BoardType } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      templateKey: z.string().nullable(),
      boardType: z.enum(["standard", "crm"]),
      name: z.string().trim().max(120),
      description: z.string().trim().max(500).nullable(),
    })
    .refine((values) => values.templateKey !== null || values.name.length > 0, {
      path: ["name"],
      message: t("pipelines.boards.nameRequired"),
    })
}

function TemplateOption({
  selected,
  icon: Icon,
  color,
  title,
  description,
  onSelect,
}: {
  selected: boolean
  icon: LucideIcon
  color: string | null
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-16 w-full items-start gap-2.5 rounded-lg p-2.5 text-left ring-1 ring-foreground/10 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "bg-accent/40 ring-2 ring-primary"
      )}
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        style={color ? { color } : undefined}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{description}</span>
      </span>
      {selected ? <Check className="absolute top-2 right-2 size-4 text-primary" aria-hidden /> : null}
    </button>
  )
}

type BoardCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Novo pipeline: em branco ou a partir de um modelo, que já traz etapas e campos. */
export function BoardCreateDialog({ open, onOpenChange }: BoardCreateDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { templates, isLoading: loadingTemplates } = useBoardTemplates(open)
  const { createBoard, renameBoard } = useBoardMutations()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { templateKey: null, boardType: "standard", name: "", description: null },
    mode: "onBlur",
  })

  useEffect(() => {
    if (open) form.reset({ templateKey: null, boardType: "standard", name: "", description: null })
  }, [form, open])

  const templateKey = form.watch("templateKey")
  const selectedTemplate = templates.find((template) => template.templateKey === templateKey)

  function selectTemplate(template: BoardTemplate | null) {
    form.setValue("templateKey", template?.templateKey ?? null, { shouldDirty: true })
    form.setValue("boardType", (template?.defaultBoardType ?? "standard") as BoardType, {
      shouldDirty: true,
    })
    form.clearErrors("name")
  }

  const submit = useFormSubmit(form, async (values) => {
    const board = await createBoard({
      name: values.name || selectedTemplate?.name || "",
      description: values.description || null,
      boardType: values.boardType,
      templateKey: values.templateKey,
    })
    // O modelo traz nome e etapas, mas a API não grava a descrição nesse caminho.
    if (values.templateKey && values.description) {
      await renameBoard(board.id, board.name, values.description)
    }
    toast.success(t("pipelines.boards.created"))
    onOpenChange(false)
    navigate(boardViewUrl(board.id))
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={t("pipelines.boards.createTitle")}
      description={t("pipelines.boards.createHint")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("pipelines.boards.create")}
          onCancel={() => onOpenChange(false)}
          cancelLabel={t("pipelines.actions.cancel")}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span id="board-template-label" className="text-sm font-medium">
            {t("pipelines.boards.template")}
          </span>
          <div role="radiogroup" aria-labelledby="board-template-label" className="grid gap-2 sm:grid-cols-2">
            <TemplateOption
              selected={templateKey === null}
              icon={SquareKanban}
              color={null}
              title={t("pipelines.boards.blank")}
              description={t("pipelines.boards.blankHint")}
              onSelect={() => selectTemplate(null)}
            />
            {loadingTemplates
              ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-16 w-full rounded-lg" />)
              : templates.map((template) => (
                  <TemplateOption
                    key={template.templateKey}
                    selected={templateKey === template.templateKey}
                    icon={boardIcon(template.icon)}
                    color={template.color}
                    title={template.name}
                    description={
                      template.description ??
                      template.stagesConfig.map((stage) => stage.name).join(" · ")
                    }
                    onSelect={() => selectTemplate(template)}
                  />
                ))}
          </div>
        </div>

        {templateKey === null ? (
          <RadioField
            control={form.control}
            name="boardType"
            label={t("pipelines.boards.type")}
            variant="cards"
            orientation="horizontal"
            options={[
              {
                value: "standard",
                label: t("pipelines.boards.typeStandard"),
                description: t("pipelines.boards.typeStandardHint"),
              },
              {
                value: "crm",
                label: t("pipelines.boards.typeCrm"),
                description: t("pipelines.boards.typeCrmHint"),
              },
            ]}
          />
        ) : null}

        <TextField
          control={form.control}
          name="name"
          label={t("pipelines.boards.name")}
          placeholder={selectedTemplate?.name ?? t("pipelines.boards.namePlaceholder")}
          maxLength={120}
          optional={templateKey !== null}
        />
        <TextareaField
          control={form.control}
          name="description"
          label={t("pipelines.boards.description")}
          placeholder={t("pipelines.boards.descriptionPlaceholder")}
          optional
          rows={2}
          maxLength={500}
        />
      </div>
    </ResponsiveDialog>
  )
}
