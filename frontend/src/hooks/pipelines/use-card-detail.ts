import { useCallback, useMemo } from "react"
import useSWRInfinite from "swr/infinite"

import { useApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"
import { apiDelete, apiGet, apiPost, apiUpload } from "@/lib/api"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { cardPath } from "@/lib/pipelines/paths"
import type {
  ActivitiesPage,
  BoardEvent,
  CardAttachment,
  CardDetail,
  Checklist,
  ChecklistItem,
  StageCheck,
} from "@/lib/pipelines/types"
import { useBoardChannelParams } from "./use-board-realtime"

const NO_CHECKLISTS: Checklist[] = []
const NO_CHECKS: StageCheck[] = []
const NO_ATTACHMENTS: CardAttachment[] = []

/** O card aberto. O canal mantém em dia: foco na aba não relê. */
export function useCardDetail(boardId: string, cardId: string | null) {
  const { data, error, isLoading, mutate } = useApi<CardDetail>(
    cardId ? cardPath(boardId, cardId) : null,
    { revalidateOnFocus: false }
  )
  return { card: data, error, isLoading: isLoading && !data, reload: mutate }
}

/* ---------- checklists do card ---------- */

type ChecklistsResponse = { checklists: Checklist[] }

export function useCardChecklists(boardId: string, cardId: string) {
  const path = `${cardPath(boardId, cardId)}/checklists`
  const { data, error, isLoading, mutate } = useApi<ChecklistsResponse>(path, {
    revalidateOnFocus: false,
  })

  const mutations = useMemo(() => {
    const patch = (update: (list: Checklist[]) => Checklist[]) =>
      mutate((current) => ({ checklists: update(current?.checklists ?? []) }), {
        revalidate: false,
      })

    const patchItems = (
      checklistId: string,
      update: (items: ChecklistItem[]) => ChecklistItem[]
    ) =>
      patch((list) =>
        list.map((checklist) =>
          checklist.id === checklistId ? { ...checklist, items: update(checklist.items) } : checklist
        )
      )

    return {
      createChecklist: async (name: string) => {
        const checklist = await apiPost<Checklist>(path, { checklist: { name } })
        await patch((list) => [...list, { ...checklist, items: checklist.items ?? [] }])
      },
      deleteChecklist: async (id: string) => {
        await apiDelete(`${path}/${id}`)
        await patch((list) => list.filter((checklist) => checklist.id !== id))
      },
      createItem: async (checklistId: string, title: string) => {
        const item = await apiPost<ChecklistItem>(`${path}/${checklistId}/items`, {
          item: { title },
        })
        await patchItems(checklistId, (items) => [...items, item])
      },
      /** Marcar responde na hora: se a API recusar, volta. */
      toggleItem: async (checklistId: string, itemId: string) => {
        const flip = (items: ChecklistItem[]) =>
          items.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item))
        await patchItems(checklistId, flip)
        try {
          await apiPost(`${path}/${checklistId}/items/${itemId}/toggle`, {})
        } catch (error) {
          await patchItems(checklistId, flip)
          throw error
        }
      },
      deleteItem: async (checklistId: string, itemId: string) => {
        await apiDelete(`${path}/${checklistId}/items/${itemId}`)
        await patchItems(checklistId, (items) => items.filter((item) => item.id !== itemId))
      },
    }
  }, [mutate, path])

  return {
    checklists: data?.checklists ?? NO_CHECKLISTS,
    error,
    isLoading: isLoading && !data,
    reload: mutate,
    ...mutations,
  }
}

/* ---------- checklist da etapa ---------- */

type StageChecksResponse = { checks: StageCheck[] }

export function useStageChecks(boardId: string, cardId: string) {
  const path = `${cardPath(boardId, cardId)}/stage-checks`
  const { data, isLoading, mutate } = useApi<StageChecksResponse>(path, {
    revalidateOnFocus: false,
  })

  const toggle = useCallback(
    async (checkId: string) => {
      const flip = (current?: StageChecksResponse) => ({
        checks: (current?.checks ?? []).map((check) =>
          check.id === checkId ? { ...check, completed: !check.completed } : check
        ),
      })
      await mutate(flip, { revalidate: false })
      try {
        await apiPost(`${path}/${checkId}/toggle`, {})
      } catch (error) {
        await mutate(flip, { revalidate: false })
        throw error
      }
    },
    [mutate, path]
  )

  return { checks: data?.checks ?? NO_CHECKS, isLoading: isLoading && !data, toggle, reload: mutate }
}

/* ---------- anexos ---------- */

type AttachmentsResponse = { attachments: CardAttachment[] }

export function useCardAttachments(boardId: string, cardId: string) {
  const path = `${cardPath(boardId, cardId)}/attachments`
  const { data, error, isLoading, mutate } = useApi<AttachmentsResponse>(path, {
    revalidateOnFocus: false,
  })

  const upload = useCallback(
    async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      const attachment = await apiUpload<CardAttachment>(path, form)
      await mutate(
        (current) => ({ attachments: [...(current?.attachments ?? []), attachment] }),
        { revalidate: false }
      )
      return attachment
    },
    [mutate, path]
  )

  const remove = useCallback(
    async (id: string) => {
      await apiDelete(`${path}/${id}`)
      await mutate(
        (current) => ({
          attachments: (current?.attachments ?? []).filter((attachment) => attachment.id !== id),
        }),
        { revalidate: false }
      )
    },
    [mutate, path]
  )

  return {
    attachments: data?.attachments ?? NO_ATTACHMENTS,
    error,
    isLoading: isLoading && !data,
    path,
    upload,
    remove,
    reload: mutate,
  }
}

/* ---------- observar ---------- */

export function useWatchCard(boardId: string, cardId: string) {
  const path = `${cardPath(boardId, cardId)}/watch`
  return useCallback(
    (watching: boolean) =>
      watching
        ? apiPost<{ watching: boolean }>(path, {})
        : apiDelete<{ watching: boolean }>(path),
    [path]
  )
}

/* ---------- atividades ---------- */

/** Os grupos do filtro. A API aceita uma ação ou uma lista separada por vírgula. */
export const ACTIVITY_GROUPS = {
  all: null,
  moves: "moved",
  deals: "deal_won,deal_lost,deal_reopened",
  updates: "updated,assigned,archived,auto_archived",
} as const

export type ActivityGroup = keyof typeof ACTIVITY_GROUPS

const ACTIVITY_PAGE = 30

export function useCardActivities(boardId: string, cardId: string, group: ActivityGroup) {
  const base = `${cardPath(boardId, cardId)}/activities`
  const type = ACTIVITY_GROUPS[group]

  const { data, error, isLoading, isValidating, size, setSize, mutate } =
    useSWRInfinite<ActivitiesPage>(
      (_index, previous: ActivitiesPage | null) => {
        if (previous && !previous.hasMore) return null
        const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE) })
        if (type) params.set("type", type)
        if (previous?.nextCursor) params.set("cursor", previous.nextCursor)
        return `${base}?${params}`
      },
      (path: string) => apiGet<ActivitiesPage>(path),
      { revalidateOnFocus: false, revalidateFirstPage: true }
    )

  // Aberta nesta aba, a linha do tempo acompanha o que chega pelo canal. Relendo, e não aplicando:
  // o texto de cada atividade é o servidor quem escreve.
  const reloadSoon = useDebouncedCallback(() => void mutate(), 500)
  const params = useBoardChannelParams(boardId)
  useChannel<BoardEvent>("PipelineBoardChannel", params, (message) => {
    if (message.event !== "card_updated" && message.event !== "card_moved" && message.event !== "comment_created") return
    const id = message.event === "comment_created" ? message.data.cardId : message.data.id
    if (id === cardId) reloadSoon()
  })

  const activities = useMemo(() => (data ?? []).flatMap((page) => page.activities), [data])
  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : false

  return {
    activities,
    hasMore,
    error,
    isLoading: isLoading && !data,
    isLoadingMore: isValidating && size > (data?.length ?? 0),
    loadMore: () => setSize(size + 1),
    reload: mutate,
  }
}
