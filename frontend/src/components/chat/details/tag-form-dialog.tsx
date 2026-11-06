import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ColorField,
  FormActions,
  ResponsiveDialog,
  TextField,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/api"
import type { ChatTag } from "@/lib/chat/types"
import { applyTag, createTag, deleteTag, updateTag } from "@/lib/chat-details/actions"
import { COLOR_SWATCHES } from "@/lib/tag-color"

type Values = { name: string; description: string | null; color: string }

const MAX_NAME = 60

/**
 * Criar e editar uma etiqueta. Etiqueta nova já entra na conversa: quem cria enquanto atende quer
 * aplicar. Excluir mora aqui, a um passo, e diz em quantas conversas ela está antes de confirmar.
 */
export default function TagFormDialog({
  chatId,
  tag,
  initialName,
  onClose,
}: {
  chatId: string
  /** Editando. Sem isto, cria. */
  tag: ChatTag | null
  initialName?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("chatDetails.tags.form.nameRequired"))
          .max(MAX_NAME, t("chatDetails.tags.form.nameTooLong", { max: MAX_NAME })),
        description: z.string().trim().nullable(),
        color: z.string().min(1, t("chatDetails.tags.form.colorRequired")),
      }),
    [t]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: tag?.name ?? initialName ?? "",
      description: tag?.description ?? null,
      color: tag?.color ?? COLOR_SWATCHES[0],
    },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    const input = {
      name: values.name,
      color: values.color,
      description: values.description || null,
    }

    if (tag) {
      await updateTag(tag.id, input)
      toast.success(t("chatDetails.tags.form.updated"))
    } else {
      const created = await createTag(input)
      await applyTag(chatId, created.id)
      toast.success(t("chatDetails.tags.form.created", { name: created.name }))
    }
    onClose()
  })

  const remove = async () => {
    if (!tag) return

    const { count } = await apiGet<{ count: number }>(`/chat-tags/${tag.id}/assigns`).catch(() => ({
      count: null as number | null,
    }))
    const confirmed = await confirm({
      title: t("chatDetails.tags.form.deleteTitle", { name: tag.name }),
      description:
        count === null
          ? t("chatDetails.tags.form.deleteHintUnknown")
          : t("chatDetails.tags.form.deleteHint", { count }),
      confirmLabel: t("chatDetails.tags.form.deleteConfirm"),
      destructive: true,
      onConfirm: () => deleteTag(tag.id),
    })
    if (confirmed) {
      toast.success(t("chatDetails.tags.form.deleted"))
      onClose()
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t(tag ? "chatDetails.tags.form.editTitle" : "chatDetails.tags.form.createTitle")}
      description={tag ? undefined : t("chatDetails.tags.form.createHint")}
      size="sm"
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(tag ? "chatDetails.tags.form.save" : "chatDetails.tags.form.create")}
          onCancel={onClose}
          secondary={
            tag ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive pointer-coarse:h-10"
                onClick={() => void remove()}
              >
                <Trash2 />
                {t("chatDetails.tags.form.delete")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <TextField
          control={form.control}
          name="name"
          label={t("chatDetails.tags.form.name")}
          hint={t("chatDetails.tags.form.nameHint")}
          placeholder={t("chatDetails.tags.form.namePlaceholder")}
          autoFocus
        />
        <TextField
          control={form.control}
          name="description"
          label={t("chatDetails.tags.form.description")}
          optional
        />
        <ColorField control={form.control} name="color" label={t("chatDetails.tags.form.color")} />
      </div>
    </ResponsiveDialog>
  )
}
