import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { deleteMessages } from "@/lib/chat/actions"
import { availableDeleteScopes, type MessageCapabilities } from "@/lib/chat/message-rules"
import { useMessageSelection } from "@/lib/chat/stores"
import type { BulkDeleteScope, ChatMessage } from "@/lib/chat/types"

/**
 * Excluir uma ou várias mensagens. "Para mim" sempre dá; "para todos" só se o canal revoga e todas
 * forem nossas, dentro das 60 horas. O servidor ainda pode recusar revogar: quem decide o que
 * aconteceu é `scopeApplied`, e a pessoa fica sabendo.
 */
export function DeleteMessagesDialog({
  chatId,
  messages,
  capabilities,
  onClose,
}: {
  chatId: string
  messages: ChatMessage[]
  capabilities: MessageCapabilities
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<BulkDeleteScope | null>(null)
  const [error, setError] = useState<string | null>(null)

  const count = messages.length
  const canEveryone = availableDeleteScopes(messages, capabilities).includes("everyone")

  const remove = async (scope: BulkDeleteScope) => {
    if (pending) return
    setPending(scope)
    setError(null)

    try {
      const { scopeApplied } = await deleteMessages(
        chatId,
        messages.map((message) => message.id),
        scope
      )
      useMessageSelection.getState().clear()
      onClose()

      if (scope === "everyone" && scopeApplied === "me") {
        toast.warning(t("chat.delete.downgraded"))
      } else {
        toast.success(t("chat.delete.done", { count }))
      }
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.serverMessage
          ? failure.serverMessage
          : t("chat.delete.failed")
      )
    } finally {
      setPending(null)
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
      description={canEveryone ? t("chat.delete.hintEveryone") : t("chat.delete.hintMe")}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={onClose}>
            {t("chat.delete.cancel")}
          </Button>
          <Button
            type="button"
            variant={canEveryone ? "outline" : "destructive"}
            disabled={Boolean(pending)}
            onClick={() => void remove("me")}
          >
            {pending === "me" ? <Loader2 className="animate-spin" /> : null}
            {t("chat.delete.forMe")}
          </Button>
          {canEveryone ? (
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(pending)}
              onClick={() => void remove("everyone")}
            >
              {pending === "everyone" ? <Loader2 className="animate-spin" /> : null}
              {t("chat.delete.forEveryone")}
            </Button>
          ) : null}
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
