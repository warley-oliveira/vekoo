import { useCallback, useEffect, useRef } from "react"

import { useChannel } from "@/hooks/use-channel"
import { removeTagFromChat } from "@/lib/chat/actions"
import { getChat } from "@/lib/chat/chat-store"
import { addOutgoing, failOutgoing, removeOutgoing } from "@/lib/chat/thread-store"
import { useAuth } from "@/lib/auth"
import { useChatTags } from "./use-chat-refs"

/** O nome é o contrato: a automação aplica esta etiqueta ao passar a conversa para uma pessoa. */
export const WAITING_OPERATOR_TAG = "aguardando-operador"

/**
 * Tira `aguardando-operador` da conversa quando alguém responde, se a organização pediu. A regra é
 * da tela, e vale para texto, áudio, arquivo e modelo: chame depois de qualquer envio. Falha aqui
 * não atrapalha o envio nem incomoda a pessoa.
 */
export function useAutoRemoveWaitingTag() {
  const settings = useAuth().session?.organization.settings as
    | { chatSettings?: { autoRemoveWaitingOperatorTag?: boolean } }
    | undefined
  const enabled = Boolean(settings?.chatSettings?.autoRemoveWaitingOperatorTag)
  const { tags } = useChatTags()

  const latest = useRef({ enabled, tags })
  useEffect(() => {
    latest.current = { enabled, tags }
  })

  return useCallback((chatId: string) => {
    if (!latest.current.enabled) return

    const tag = latest.current.tags.find((item) => item.name === WAITING_OPERATOR_TAG)
    if (!tag || !getChat(chatId)?.tagIds.includes(tag.id)) return

    removeTagFromChat(chatId, tag.id).catch((error: unknown) => {
      console.warn("[chat] não foi possível tirar a etiqueta de espera", error)
    })
  }, [])
}

export type SendTextInput = {
  /** O que vai ao servidor, com as citações de anexo. */
  payload: string
  /** O que aparece na bolha até o eco. */
  text: string
  replyToMessageId: string | null
}

/**
 * Enviar texto: aparece na hora, como otimista, e vai pelo canal da conversa. Canal fora do ar não
 * perde o texto: a bolha fica como "não enviada", com tentar de novo. A confirmação (e o motivo, se
 * o provedor recusar) volta na própria mensagem, pelo mesmo canal.
 */
export function useSendMessage(chatId: string) {
  const { perform } = useChannel("ChatChannel", { chatId })
  const removeWaitingTag = useAutoRemoveWaitingTag()

  const send = useCallback(
    ({ payload, text, replyToMessageId }: SendTextInput) => {
      const localId = addOutgoing(chatId, { payload, text, replyToMessageId })

      const sent = perform("send_message", {
        chatId,
        message: payload,
        replyToMessageId,
      })

      if (sent) removeWaitingTag(chatId)
      else failOutgoing(chatId, localId, "offline")
    },
    [chatId, perform, removeWaitingTag]
  )

  const retryOutgoing = useCallback(
    (localId: string, input: SendTextInput) => {
      removeOutgoing(chatId, localId)
      send(input)
    },
    [chatId, send]
  )

  return { send, retryOutgoing, removeWaitingTag }
}
