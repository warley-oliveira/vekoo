import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { deleteChat, updateChat } from "@/lib/chat/actions"
import { chatDisplayName } from "@/lib/chat/chat-store"
import type { Chat } from "@/lib/chat/types"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"

/**
 * O que dá para fazer com a conversa aberta: abrir e fechar, pausar a automação, excluir. O mesmo
 * no cabeçalho da tela larga e na folha do celular, com os mesmos avisos.
 */
export function useThreadActions(chat: Chat, { onRemoved }: { onRemoved: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()

  const closed = chat.status === "closed"
  const automationOn = chat.automationEnabled

  const toggleStatus = useCallback(() => {
    const next = closed ? "open" : "closed"
    updateChat(chat.id, { status: next })
      .then(() => toast.success(next === "closed" ? t("chat.status.closedDone") : t("chat.status.openedDone")))
      .catch(() => toast.error(t("chat.status.failed")))
  }, [chat.id, closed, t])

  const toggleAutomation = useCallback(() => {
    updateChat(chat.id, { automationEnabled: !automationOn })
      .then(() =>
        toast.success(automationOn ? t("chat.automation.pausedDone") : t("chat.automation.resumedDone"))
      )
      .catch(() => toast.error(t("chat.automation.failed")))
  }, [automationOn, chat.id, t])

  const name = chatDisplayName(chat, {
    visitor: t("chat.contact.visitor"),
    contact: t("chat.contact.fallback"),
  })

  const remove = useCallback(async () => {
    const confirmed = await confirm({
      title: t("chat.remove.title", { name }),
      description: t("chat.remove.hint"),
      confirmLabel: t("chat.remove.confirm"),
      destructive: true,
      onConfirm: async () => {
        await deleteChat(chat.id)
      },
    })
    if (confirmed) {
      toast.success(t("chat.remove.done"))
      onRemoved()
    }
  }, [chat.id, confirm, name, onRemoved, t])

  const automationLabel = automationOn
    ? t("chat.automation.on")
    : chat.automationResumeAt
      ? t("chat.automation.pausedUntil", {
          when: formatRelative(chat.automationResumeAt, language),
        })
      : t("chat.automation.paused")

  return {
    closed,
    automationOn,
    automationLabel,
    statusLabel: closed ? t("chat.status.open") : t("chat.status.close"),
    toggleStatus,
    toggleAutomation,
    remove,
  }
}
