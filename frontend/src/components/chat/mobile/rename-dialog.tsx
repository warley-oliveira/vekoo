import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { FormActions, ResponsiveDialog, TextField, useFormSubmit } from "@/components/shared"
import { updateChat } from "@/lib/chat/actions"
import type { Chat } from "@/lib/chat/types"

const MAX_LENGTH = 120

/**
 * Editar o nome. Na tela larga é ali mesmo, no cabeçalho: no celular o teclado sobe e o campo precisa
 * de largura, então vira uma folha pequena. Sem nome, a conversa volta a usar o que veio do canal.
 */
export default function RenameDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const { t } = useTranslation()

  const schema = useMemo(
    () => z.object({ name: z.string().trim().max(MAX_LENGTH, t("chatMobile.rename.tooLong")) }),
    [t]
  )
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: chat.displayName || chat.userName || "" },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async ({ name }) => {
    try {
      await updateChat(chat.id, { displayName: name || null })
      onClose()
    } catch {
      toast.error(t("chat.header.renameFailed"))
    }
  })

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      size="sm"
      title={t("chat.header.rename")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("chatMobile.rename.save")}
          onCancel={onClose}
          requireChanges
        />
      }
    >
      <TextField
        control={form.control}
        name="name"
        label={t("chatMobile.rename.label")}
        hint={t("chatMobile.rename.hint")}
        autoFocus
        maxLength={MAX_LENGTH}
      />
    </ResponsiveDialog>
  )
}
