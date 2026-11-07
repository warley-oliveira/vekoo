import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { deleteMessages } from "@/lib/chat/actions"
import { useMessageSelection } from "@/lib/chat/stores"
import type { ChatMessage } from "@/lib/chat/types"

/** Excluir uma ou várias mensagens. Some só daqui: o contato continua vendo o que recebeu. */
export function DeleteMessagesDialog({
  chatId,
  messages,
  onClose,
}: {
  chatId: string
  messages: ChatMessage[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const count = messages.length

  const remove = async () => {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      await deleteMessages(
        chatId,
        messages.map((message) => message.id)
      )
      useMessageSelection.getState().clear()
      onClose()
      toast.success(t("chat.delete.done", { count }))
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.serverMessage
          ? failure.serverMessage
          : t("chat.delete.failed")
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      size="sm"
      title={t("chat.delete.title", { count })}
      description={t("chat.delete.hintMe", { count })}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            {t("chat.delete.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void remove()}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("chat.delete.forMe")}
          </Button>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}
