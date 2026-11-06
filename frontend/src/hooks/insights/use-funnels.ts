import { useCallback, useState } from "react"
import { useSWRConfig, type Arguments } from "swr"

import { columnKey, mergePage, moveInBoard, patchChatInBoard } from "@/components/funnels/board-state"
import type {
  BoardChat,
  BoardColumn,
  BoardFilters,
  Funnel,
  FunnelBoard,
} from "@/components/funnels/types"
import { useApi } from "@/hooks/use-api"
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api"

// As leituras e mutações de funis. O quadro não tem canal próprio, como na origem: quem mexe nele
// atualiza o cache na mão, sem revalidar, senão as colunas voltariam para a primeira página.

export const FUNNELS_KEY = "/funnels?perPage=100"
const PER_COLUMN = 20

const isDashboardKey = (key: Arguments) => typeof key === "string" && key.startsWith("/dashboard")
const isBoardOf = (id: string) => (key: Arguments) =>
  typeof key === "string" && key.startsWith(`/funnels/${id}/`)

export function boardPath(funnelId: string, filters: BoardFilters): string {
  const query = new URLSearchParams({
    dateField: filters.dateField,
    days: String(filters.days),
    perColumn: String(PER_COLUMN),
  })
  if (filters.q) query.set("q", filters.q)
  if (filters.assignedUser) query.set("assignedUser", filters.assignedUser)
  for (const id of filters.tagIds) query.append("tagIds[]", id)
  return `/funnels/${funnelId}/board?${query}`
}

export function useFunnels() {
  const { data, error, isLoading, mutate } = useApi<{ funnels: Funnel[] }>(FUNNELS_KEY, {
    revalidateOnFocus: false,
  })
  return { funnels: data?.funnels, error, isLoading, reload: () => mutate() }
}

export type FunnelInput = {
  name?: string
  description?: string | null
  /** A lista inteira: com `id` renomeia ou move, sem `id` é nova, e a que não veio sai. */
  stages?: { id?: string; name: string }[]
}

export function useFunnelMutations() {
  const { mutate } = useSWRConfig()

  // O Dashboard mostra os funis também, e guarda o relatório: ele relê da próxima vez.
  const refreshList = useCallback(async () => {
    await mutate(FUNNELS_KEY)
    await mutate(isDashboardKey, undefined, { revalidate: false })
  }, [mutate])

  const createFunnel = useCallback(
    async (input: FunnelInput) => {
      const { funnel } = await apiPost<{ funnel: Funnel }>("/funnels", { funnel: input })
      await refreshList()
      return funnel
    },
    [refreshList]
  )

  const updateFunnel = useCallback(
    async (id: string, input: FunnelInput) => {
      const { funnel } = await apiPatch<{ funnel: Funnel }>(`/funnels/${id}`, { funnel: input })
      await Promise.all([refreshList(), mutate(isBoardOf(id))])
      return funnel
    },
    [mutate, refreshList]
  )

  const deleteFunnel = useCallback(
    async (id: string) => {
      await apiDelete(`/funnels/${id}`)
      // Sem revalidar o quadro dele: perguntar de um funil que acabou de sair só daria 404.
      await mutate(isBoardOf(id), undefined, { revalidate: false })
      await refreshList()
    },
    [mutate, refreshList]
  )

  return { createFunnel, updateFunnel, deleteFunnel }
}

export function useFunnelBoard(funnelId: string, filters: BoardFilters) {
  const key = boardPath(funnelId, filters)
  const { data, error, isLoading, isValidating, mutate } = useApi<FunnelBoard>(key, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const [loadingColumns, setLoadingColumns] = useState<ReadonlySet<string>>(new Set())

  const loadMore = useCallback(
    async (column: BoardColumn) => {
      const id = columnKey(column.stageId)
      setLoadingColumns((current) => new Set(current).add(id))
      try {
        // Pelo que já está na tela, e não pelo número da última página: mover uma conversa desloca
        // o resto da coluna no servidor, e `page + 1` pularia a que subiu. O repetido é descartado.
        const page = Math.floor(column.chats.length / PER_COLUMN) + 1
        const separator = key.includes("?") ? "&" : "?"
        const response = await apiGet<FunnelBoard>(
          `${key}${separator}${encodeURIComponent(`page[${id}]`)}=${page}`
        )
        const fetched = response.columns.find((entry) => entry.stageId === column.stageId)
        if (!fetched) return
        await mutate((current) => (current ? mergePage(current, fetched, filters.dateField) : current), {
          revalidate: false,
        })
      } finally {
        setLoadingColumns((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    },
    [filters.dateField, key, mutate]
  )

  /**
   * Otimista: o cartão já muda de coluna, e volta se a API recusar. A volta é um movimento ao contrário
   * e não uma foto do quadro: outro cartão movido enquanto isso continua onde está.
   */
  const moveChat = useCallback(
    async (chat: BoardChat, toStageId: string | null) => {
      const fromStageId = chat.stageId
      await mutate((current) => (current ? moveInBoard(current, chat, toStageId, filters.dateField) : current), {
        revalidate: false,
      })
      try {
        await apiPut(`/funnels/${funnelId}/chats/${chat.id}`, { stageId: toStageId })
      } catch (cause) {
        await mutate(
          (current) =>
            current
              ? moveInBoard(current, { ...chat, stageId: toStageId }, fromStageId, filters.dateField)
              : current,
          { revalidate: false }
        )
        throw cause
      }
    },
    [filters.dateField, funnelId, mutate]
  )

  const patchChat = useCallback(
    (chatId: string, patch: Partial<BoardChat>) =>
      mutate((current) => (current ? patchChatInBoard(current, chatId, patch) : current), { revalidate: false }),
    [mutate]
  )

  return {
    board: data,
    error,
    isLoading,
    isValidating,
    loadingColumns,
    reload: () => mutate(),
    loadMore,
    moveChat,
    patchChat,
  }
}
