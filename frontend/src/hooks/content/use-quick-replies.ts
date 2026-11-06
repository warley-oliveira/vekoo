import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"

import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { QuickReply, QuickReplyInput } from "@/lib/content/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"

export const QUICK_REPLIES_KEY = "/quick-replies?perPage=100"

/**
 * Todas as mensagens rápidas da organização. É o que o composer do chat lê: a lista inteira, em
 * cache, para filtrar a cada tecla depois da `/`.
 *
 * Ao inserir uma mensagem na conversa, passe o texto por `fillQuickReply`
 * (`@/lib/content/quick-reply-content`): é ele que troca as variáveis pelos dados do contato.
 */
export function useQuickReplies() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<QuickReply[]>(
    QUICK_REPLIES_KEY,
    () => fetchAllPages<QuickReply>(QUICK_REPLIES_KEY, "quickReplies")
  )

  return { quickReplies: data, error, isLoading, isValidating, reload: () => mutate() }
}

export function useQuickReplyMutations() {
  const { mutate } = useSWRConfig()
  const revalidate = useCallback(() => mutate(QUICK_REPLIES_KEY), [mutate])

  const createQuickReply = useCallback(
    async (input: QuickReplyInput) => {
      const { quickReply } = await apiPost<{ quickReply: QuickReply }>("/quick-replies", {
        quickReply: input,
      })
      await revalidate()
      return quickReply
    },
    [revalidate]
  )

  const updateQuickReply = useCallback(
    async (id: string, input: QuickReplyInput) => {
      const { quickReply } = await apiPatch<{ quickReply: QuickReply }>(`/quick-replies/${id}`, {
        quickReply: input,
      })
      await revalidate()
      return quickReply
    },
    [revalidate]
  )

  const deleteQuickReply = useCallback(
    async (id: string) => {
      await apiDelete(`/quick-replies/${id}`)
      await mutate<QuickReply[]>(
        QUICK_REPLIES_KEY,
        (current) => current?.filter((reply) => reply.id !== id),
        { revalidate: false }
      )
    },
    [mutate]
  )

  return { createQuickReply, updateQuickReply, deleteQuickReply }
}
