import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiPost } from "@/lib/api"
import type { AppNotification } from "@/lib/types"

const KEY = "/notifications"

type NotificationsResponse = {
  notifications: AppNotification[]
  unread: number
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

  return { readAll }
}
