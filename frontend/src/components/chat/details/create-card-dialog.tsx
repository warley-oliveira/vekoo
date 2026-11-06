import { useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { mutate as globalMutate } from "swr"
import { z } from "zod"

import {
  EmptyState,
  ErrorState,
  FormActions,
  ListSkeleton,
  ResponsiveDialog,
  SelectField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  chatCardsKey,
  usePipelineBoardOptions,
} from "@/hooks/chat-details/use-chat-details-data"
import { apiPost } from "@/lib/api"

type Values = { boardId: string | null; stageId: string | null }

/**
 * Levar a conversa para um quadro. Título e descrição saem do contato (`createFromChat`), e a pessoa
 * só diz onde: é o que falta para o card nascer, e o resto ela edita no quadro.
 */
export default function CreateCardDialog({
  chatId,
  onClose,
}: {
  chatId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { boards, error, isLoading, retry } = usePipelineBoardOptions(true)

  const schema = useMemo(
    () =>
      z.object({
        boardId: z.string().nullable().refine(Boolean, t("chatDetails.cards.boardRequired")),
        stageId: z.string().nullable().refine(Boolean, t("chatDetails.cards.stageRequired")),
      }),
    [t]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { boardId: null, stageId: null },
  })

  const boardId = useWatch({ control: form.control, name: "boardId" })
  const board = boards.find((item) => item.id === boardId)

  // Um quadro só: não há o que perguntar.
  useEffect(() => {
    if (boards.length === 1 && !form.getValues("boardId")) form.setValue("boardId", boards[0].id)
  }, [boards, form])

  // Outra etapa não vale em outro quadro. A primeira é o caminho comum.
  useEffect(() => {
    form.setValue("stageId", board?.stages[0]?.id ?? null)
  }, [board, form])

  const submit = useFormSubmit(form, async (values) => {
    await apiPost(`/pipelines/boards/${values.boardId}/cards`, {
      card: { stageId: values.stageId, chatId, createFromChat: true },
    })
    await globalMutate(chatCardsKey(chatId))
    toast.success(t("chatDetails.cards.created", { board: board?.name ?? "" }))
    onClose()
  })

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t("chatDetails.cards.createTitle")}
      description={t("chatDetails.cards.createHint")}
      size="sm"
      onSubmit={submit}
      footer={
        boards.length > 0 ? (
          <FormActions
            form={form}
            submitLabel={t("chatDetails.cards.createConfirm")}
            onCancel={onClose}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={retry} className="border-0 p-4" />
      ) : boards.length === 0 ? (
        <EmptyState
          title={t("chatDetails.cards.noBoards")}
          description={t("chatDetails.cards.noBoardsHint")}
          className="border-0 p-4"
        />
      ) : (
        <div className="flex flex-col gap-4 pt-1">
          <SelectField
            control={form.control}
            name="boardId"
            label={t("chatDetails.cards.board")}
            options={boards.map((item) => ({ value: item.id, label: item.name }))}
          />
          <SelectField
            control={form.control}
            name="stageId"
            label={t("chatDetails.cards.stage")}
            disabled={!board}
            options={(board?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name }))}
          />
        </div>
      )}

      {!isLoading && !error && boards.length === 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="mx-auto mt-2 flex w-fit pointer-coarse:h-10"
          nativeButton={false}
          render={<Link to="/pipelines" />}
        >
          {t("chatDetails.cards.openPipelines")}
        </Button>
      ) : null}
    </ResponsiveDialog>
  )
}
