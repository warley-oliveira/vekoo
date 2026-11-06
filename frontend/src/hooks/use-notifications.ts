import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"
import { apiDelete, apiPost } from "@/lib/api"
import type { AppNotification } from "@/lib/types"

// Contrato em docs/migration/api/access.md.

const KEY = "/notifications"

export const NOTIFICATIONS_PAGE_SIZE = 20
/** O teto de `perPage` nesta rota. */
export const NOTIFICATIONS_MAX_PER_PAGE = 50

/** O filtro é do servidor: a lista é paginada, e filtrar no cliente veria só a página. */
export type NotificationsTab = "all" | "unread" | "archived"

type NotificationsResponse = {
  notifications: AppNotification[]
  /** Total de não lidas, sem considerar os filtros. */
  unread: number
  meta?: { hasMore: boolean }
}

function listKey(tab: NotificationsTab, perPage: number): string {
  const params = new URLSearchParams()
  if (perPage !== NOTIFICATIONS_PAGE_SIZE) params.set("perPage", String(perPage))
  if (tab === "unread") params.set("unread", "true")
  if (tab === "archived") params.set("archived", "true")
  const query = params.toString()
  return query ? `${KEY}?${query}` : KEY
}

/** Toda lista em cache: a padrão, a de cada aba e cada tamanho. */
function isListKey(key: unknown): boolean {
  return typeof key === "string" && (key === KEY || key.startsWith(`${KEY}?`))
}

export function useNotifications(
  tab: NotificationsTab = "all",
  perPage: number = NOTIFICATIONS_PAGE_SIZE
) {
  const { data, error, isLoading, mutate } = useApi<NotificationsResponse>(
    listKey(tab, perPage)
  )

  return {
    notifications: data?.notifications,
    unread: data?.unread ?? 0,
    hasMore: data?.meta?.hasMore ?? false,
    isLoading,
    error,
    reload: () => mutate(),
  }
}

/**
 * Tempo real. O canal avisa ao entrar, a cada aviso novo e quando o total muda em outra
 * aba. O eco da própria ação (que já está na tela, de forma otimista) não refaz a leitura.
 * Chamada uma vez, no centro de avisos.
 */
export function useNotificationsChannel() {
  const { cache, mutate } = useSWRConfig()

  return useChannel<{ unreadCount?: number; notification?: AppNotification }>(
    "NotificationsChannel",
    undefined,
    (message) => {
      const unread = message?.unreadCount
      const known = (cache.get(KEY)?.data as NotificationsResponse | undefined)?.unread
      const stale =
        Boolean(message?.notification) ||
        (typeof unread === "number" && known !== undefined && unread !== known)

      void mutate(
        isListKey,
        (current?: NotificationsResponse) =>
          current && typeof unread === "number" ? { ...current, unread } : current,
        { revalidate: stale }
      )
    }
  )
}

export function useNotificationMutations() {
  const { mutate } = useSWRConfig()

  const patchLists = useCallback(
    (patch: (list: NotificationsResponse) => NotificationsResponse) =>
      mutate(
        isListKey,
        (current?: NotificationsResponse) => current && patch(current),
        { revalidate: false }
      ),
    [mutate]
  )
  const revalidateLists = useCallback(() => mutate(isListKey), [mutate])

  const readAll = useCallback(async () => {
    // Otimista: marcar como lido não pode ter latência — é o gesto de fechar o
    // aviso, não de salvar trabalho.
    await patchLists((list) => ({
      ...list,
      notifications: list.notifications.map((n) => ({ ...n, read: true })),
      unread: 0,
    }))
    try {
      await apiPost("/notifications/read-all")
    } finally {
      await revalidateLists()
    }
  }, [patchLists, revalidateLists])

  /** Marca uma não lida como lida. Quem chama garante que ela não estava lida. */
  const read = useCallback(
    async (id: string) => {
      await patchLists((list) => ({
        ...list,
        notifications: list.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unread: Math.max(0, list.unread - 1),
      }))
      try {
        await apiPost(`/notifications/${encodeURIComponent(id)}/read`)
      } finally {
        await revalidateLists()
      }
    },
    [patchLists, revalidateLists]
  )

  /** Dispensar: sai da lista e, se for da pessoa, vai para as arquivadas. */
  const dismiss = useCallback(
    async (notification: AppNotification) => {
      await patchLists((list) => ({
        ...list,
        notifications: list.notifications.filter((n) => n.id !== notification.id),
        unread: Math.max(0, list.unread - (notification.read ? 0 : 1)),
      }))
      try {
        await apiDelete(`/notifications/${encodeURIComponent(notification.id)}`)
      } finally {
        await revalidateLists()
      }
    },
    [patchLists, revalidateLists]
  )

  return { readAll, read, dismiss }
}
