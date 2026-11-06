import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { z } from "zod"

import { FormActions, ResponsiveDialog, TextField, useFormSubmit } from "@/components/shared"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { columnKey } from "./board-state"
import type { BoardChat, BoardColumn } from "./types"

const MAX_STAGE_NAME = 60

type StageNameDialogProps = {
  mode: "rename" | "create"
  initialName: string
  /** Os nomes das outras etapas: repetir é recusado, e aqui avisa antes de ir ao servidor. */
  otherNames: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => Promise<void>
}

/** Renomear uma etapa ou criar uma, direto do quadro. */
export function StageNameDialog({ mode, initialName, otherNames, open, onOpenChange, onSubmit }: StageNameDialogProps) {
  const { t } = useTranslation()

  const schema = useMemo(() => {
    const taken = new Set(otherNames.map((name) => name.trim().toLocaleLowerCase()))
    return z.object({
      name: z
        .string()
        .trim()
        .min(1, t("funnels.form.stageRequired"))
        .max(MAX_STAGE_NAME, t("funnels.form.stageTooLong", { max: MAX_STAGE_NAME }))
        .refine((value) => !taken.has(value.toLocaleLowerCase()), t("funnels.form.stageDuplicate")),
    })
  }, [otherNames, t])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const submit = useFormSubmit(form, async (values) => {
    await onSubmit(values.name)
    close()
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t(mode === "rename" ? "funnels.stage.renameTitle" : "funnels.stage.createTitle")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(mode === "rename" ? "funnels.stage.renameSubmit" : "funnels.stage.createSubmit")}
          onCancel={close}
          requireChanges={mode === "rename"}
        />
      }
    >
      <TextField
        control={form.control}
        name="name"
        label={t("funnels.stage.name")}
        placeholder={t("funnels.form.stagePlaceholder")}
        autoFocus
      />
    </ResponsiveDialog>
  )
}

type MoveChatDialogProps = {
  chat: BoardChat | null
  chatLabel: string
  columns: BoardColumn[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMove: (chat: BoardChat, toStageId: string | null) => void
}

/** Mover sem arrastar: é o caminho do celular, de quem usa só teclado e de quem prefere um clique. */
export function MoveChatDialog({ chat, chatLabel, columns, open, onOpenChange, onMove }: MoveChatDialogProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t("funnels.move.title")}
      description={chatLabel}
    >
      <ul className="flex flex-col gap-1">
        {columns.map((column) => {
          const current = chat?.stageId === column.stageId
          return (
            <li key={columnKey(column.stageId)}>
              <button
                type="button"
                disabled={current}
                aria-current={current || undefined}
                onClick={() => {
                  if (!chat) return
                  onMove(chat, column.stageId)
                  onOpenChange(false)
                }}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  current && "cursor-default bg-accent font-medium text-accent-foreground hover:bg-accent"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{column.stageName}</span>
                {current ? (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Check aria-hidden className="size-3.5" />
                    {t("funnels.move.current")}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatNumber(column.count, language)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </ResponsiveDialog>
  )
}
