import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { mutate as globalMutate } from "swr"

import { ApiError, apiPost } from "@/lib/api"
import type { SuggestReplyResponse } from "@/lib/chat-details/types"

/**
 * A resposta que a IA sugere, a partir das últimas mensagens. Não envia nada: a pessoa lê, ajusta e
 * decide. Trocar de conversa no meio descarta a sugestão, para ela nunca cair na caixa de outro contato.
 */
export function useSuggestReply(chatId: string, insertText: (text: string) => void) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const currentChat = useRef(chatId)

  useEffect(() => {
    currentChat.current = chatId
    setLoading(false)
  }, [chatId])

  const suggest = useCallback(async () => {
    setLoading(true)
    try {
      const { messages, credits } = await apiPost<SuggestReplyResponse>(
        `/chats/${chatId}/suggest-reply`
      )
      void globalMutate("/credits", credits, { revalidate: false })
      if (currentChat.current !== chatId) return

      const text = messages.join("\n").trim()
      if (text) insertText(text)
      else toast.info(t("chatDetails.suggest.empty"))
    } catch (error) {
      if (currentChat.current !== chatId) return

      const code = error instanceof ApiError ? error.code : null
      toast.error(
        code === "noCredits"
          ? t("chatDetails.suggest.noCredits")
          : code === "busy"
            ? t("chatDetails.suggest.busy")
            : t("chatDetails.suggest.failed")
      )
    } finally {
      if (currentChat.current === chatId) setLoading(false)
    }
  }, [chatId, insertText, t])

  return { suggest, loading }
}
