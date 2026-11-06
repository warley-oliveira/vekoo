import { useCallback } from "react"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPost } from "@/lib/api"
import type { ArchivedCardsResponse, ArchivedStatus } from "@/lib/pipelines-admin/types"
import { boardKey, useRevalidateBoard } from "./use-board"

type Filters = {
  status: ArchivedStatus
  search: string
  page: number
  perPage: number
}

export function useArchivedCards(boardId: string, { status, search, page, perPage }: Filters) {
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
  if (status !== "all") params.set("status", status)
  if (search) params.set("search", search)

  const { data, error, isLoading, isValidating, mutate } = useApi<ArchivedCardsResponse>(
    `${boardKey(boardId)}/archived-cards?${params}`,
    { keepPreviousData: true }
  )

  return {
    cards: data?.cards,
    meta: data?.meta,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export function useArchivedCardMutations(boardId: string) {
  const revalidate = useRevalidateBoard(boardId)
  const base = `${boardKey(boardId)}/cards`

  /** Volta para o quadro no estado em que estava: um negócio ganho continua ganho. */
  const restoreCard = useCallback(
    async (id: string) => {
      await apiPost(`${base}/${id}/archive`, { undo: true })
      await revalidate()
    },
    [base, revalidate]
  )

  const restoreCards = useCallback(
    async (ids: string[]) => {
      await apiPost(`${base}/bulk-update`, { cardIds: ids, archived: false })
      await revalidate()
    },
    [base, revalidate]
  )

  /** Limpa ganho e perda, tira do arquivo e tira a etiqueta da conversa. */
  const reopenCard = useCallback(
    async (id: string) => {
      await apiPost(`${base}/${id}/reopen`)
      await revalidate()
    },
    [base, revalidate]
  )

  const deleteCard = useCallback(
    async (id: string) => {
      await apiDelete(`${base}/${id}`)
      await revalidate()
    },
    [base, revalidate]
  )

  /** A API apaga um de cada vez. Devolve quantos não saíram, para a tela dizer. */
  const deleteCards = useCallback(
    async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => apiDelete(`${base}/${id}`)))
      await revalidate()
      return results.filter((result) => result.status === "rejected").length
    },
    [base, revalidate]
  )

  return { restoreCard, restoreCards, reopenCard, deleteCard, deleteCards }
}
