import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"
import { ApiError, apiPost } from "@/lib/api"
import type { AppNotification } from "@/lib/types"

const KEY = "/notifications"

type NotificationsResponse = {
  notifications: AppNotification[]
  unread: number
}

export function isNotificationRead(notification: AppNotification): boolean {
  return notification.read ?? Boolean(notification.readAt)
}

export function useNotifications() {
  const { data, error, isLoading, mutate } = useApi<NotificationsResponse>(KEY)

  return {
    notifications: data?.notifications,
    unread: data?.unread ?? 0,
    isLoading,
    error,
    reload: () => mutate(),
  }
}

/**
 * Tempo real: o canal avisa ao entrar (com o total de não lidas) e a cada aviso novo.
 * Chamada uma vez, no centro de avisos. Refaz a leitura em vez de costurar o payload na
 * lista: é mais simples, e cobre o que se perdeu enquanto a conexão estava caída.
 */
export function useNotificationsChannel() {
  const { mutate } = useSWRConfig()

  return useChannel<{ unreadCount?: number }>(
    "NotificationsChannel",
    undefined,
    (message) => {
      const unread = message?.unreadCount
      void mutate(
        KEY,
        (current?: NotificationsResponse) =>
          current && typeof unread === "number" ? { ...current, unread } : current,
        { revalidate: true }
      )
    }
  )
}

export function useNotificationMutations() {
  const { mutate } = useSWRConfig()

  const readAll = useCallback(async () => {
    // Otimista: marcar como lido não pode ter latência — é o gesto de fechar o
    // aviso, não de salvar trabalho.
    await mutate(
      KEY,
      (current?: NotificationsResponse) =>
        current && {
          notifications: current.notifications.map((n) => ({ ...n, read: true })),
          unread: 0,
        },
      { revalidate: false }
    )
    try {
      // A resposta já é a lista inteira: aproveitamos em vez de pedir de novo.
      const fresh = await apiPost<NotificationsResponse>("/notifications/read-all")
      await mutate(KEY, fresh, { revalidate: false })
    } catch {
      await mutate(KEY)
    }
  }, [mutate])

  const read = useCallback(
    async (id: string) => {
      await mutate(
        KEY,
        (current?: NotificationsResponse) => {
          if (!current) return current
          const target = current.notifications.find((n) => n.id === id)
          const wasUnread = target ? !isNotificationRead(target) : false
          return {
            notifications: current.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unread: Math.max(0, current.unread - (wasUnread ? 1 : 0)),
          }
        },
        { revalidate: false }
      )
      try {
        await apiPost(`/notifications/${encodeURIComponent(id)}/read`)
      } catch (error) {
        // Enquanto o servidor não tiver esta rota, vale o otimista até a próxima
        // leitura: voltar para "não lida" na cara da pessoa seria pior.
        if (!(error instanceof ApiError && error.status === 404)) await mutate(KEY)
      }
    },
    [mutate]
  )

  return { readAll, read }
}
