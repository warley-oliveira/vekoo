import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { isPieceKey } from "@/hooks/use-pieces"
import { apiDelete, apiPost } from "@/lib/api"
import { getClientId } from "@/lib/cable"
import type { AgentTurn, Conversation, ConversationSummary, StartTurnInput } from "@/lib/agent"

// As conversas de criação de uma marca. Toda função recebe a marca — a
// conversa vive dentro dela, como todo o resto.

export function conversationsKey(brandId: string): string {
  return `/brands/${brandId}/conversations`
}

export function conversationKey(brandId: string, id: string | undefined): string | null {
  return id ? `/brands/${brandId}/conversations/${id}` : null
}

export function isConversationKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith("/brands/") && key.includes("/conversations")
}

export function useConversations(brandId: string) {
  const { data, error, isLoading, mutate } = useApi<{
    conversations: ConversationSummary[]
    retentionDays: number
  }>(conversationsKey(brandId))

  return {
    conversations: data?.conversations,
    retentionDays: data?.retentionDays ?? 30,
    isLoading: isLoading && !data,
    error,
    reload: () => mutate(),
  }
}

export function useConversation(brandId: string, id: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<Conversation>(conversationKey(brandId, id))
  return { conversation: data, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export function useConversationMutations(brandId: string) {
  const { mutate } = useSWRConfig()
  const base = conversationsKey(brandId)
  const headers = { headers: { "X-Client-Id": getClientId() } }

  const resync = useCallback(() => mutate(isConversationKey), [mutate])

  /** Abre a conversa e manda o primeiro pedido: um gesto só. */
  const start = useCallback(
    async (input: StartTurnInput): Promise<Conversation> => {
      const conversation = await apiPost<Conversation>(base, { turn: input }, headers)
      await mutate(conversationKey(brandId, conversation.id), conversation, { revalidate: false })
      await mutate(base)
      return conversation
    },
    // `headers` é literal e estável em conteúdo; recriá-lo não muda nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, brandId, mutate]
  )

  /**
   * Um turno novo na conversa aberta. O turno volta `thinking` e entra na
   * conversa em cache na hora — quem espera vê o próprio pedido subir antes
   * de o agente responder.
   */
  const send = useCallback(
    async (conversationId: string, input: StartTurnInput): Promise<AgentTurn> => {
      const turn = await apiPost<AgentTurn>(`${base}/${conversationId}/turns`, { turn: input }, headers)
      await mutate(
        conversationKey(brandId, conversationId),
        (current?: Conversation) => current && { ...current, turns: [...current.turns, turn] },
        { revalidate: false }
      )
      await mutate(base)
      return turn
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, brandId, mutate]
  )

  const remove = useCallback(
    async (conversationId: string) => {
      await apiDelete(`${base}/${conversationId}`)
      await resync()
      // A conversa some, as peças ficam: a galeria precisa recarregar sem elas
      // penduradas num turno que não existe mais.
      await mutate(isPieceKey)
    },
    [base, mutate, resync]
  )

  return { start, send, remove, resync }
}
