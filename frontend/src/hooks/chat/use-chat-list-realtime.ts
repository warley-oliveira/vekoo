import { useCallback, useEffect, useRef } from "react"

import { useChannel } from "@/hooks/use-channel"
import { useCan } from "@/hooks/use-can"
import { publishChat, publishRecentChats, removeChat, requestListResync } from "@/lib/chat/chat-store"
import type { ChatListMessage } from "@/lib/chat/types"
import { useLiveSyncGuard } from "./use-live-sync-guard"

/** Sem resposta do `request_recent` nesse prazo, o socket está mudo: confere por HTTP. */
const RECENT_TIMEOUT_MS = 6_000
/** Foco, rede e relógio chegam juntos; um pedido basta. */
const RECENT_MIN_INTERVAL_MS = 10_000
const GUARD_POLL_MS = 60_000

/**
 * O canal da lista, uma assinatura só, no alto da página. Os eventos vão para `chat-store`, e as
 * listas ouvem de lá. Ao reconectar pede as conversas mais recentes por `request_recent`: o
 * que mudou nesse intervalo chega sem refazer a lista.
 */
export function useChatListRealtime(): { connected: boolean } {
  const canChat = useCan("chat")
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRequestAt = useRef(0)

  const handleMessage = useCallback((message: ChatListMessage) => {
    if (message.action === "upsert") {
      publishChat(message.event)
    } else if (message.action === "remove") {
      removeChat(message.event.id)
    } else if (message.action === "recent_chats") {
      if (recentTimer.current) clearTimeout(recentTimer.current)
      recentTimer.current = null
      publishRecentChats(message.events ?? [])
    }
  }, [])

  const { connected, perform } = useChannel<ChatListMessage>(
    canChat ? "ChatListChannel" : null,
    undefined,
    handleMessage
  )

  const requestRecent = useCallback(
    (force = false) => {
      const now = Date.now()
      if (!force && now - lastRequestAt.current < RECENT_MIN_INTERVAL_MS) return
      lastRequestAt.current = now

      if (!perform("request_recent")) {
        requestListResync()
        return
      }

      if (recentTimer.current) clearTimeout(recentTimer.current)
      recentTimer.current = setTimeout(() => {
        recentTimer.current = null
        requestListResync()
      }, RECENT_TIMEOUT_MS)
    },
    [perform]
  )

  // A primeira conexão não pede nada: a busca inicial da lista já cobre. Só a volta.
  const everConnected = useRef(false)
  const wasConnected = useRef(false)
  useEffect(() => {
    if (connected && everConnected.current && !wasConnected.current) requestRecent(true)
    if (connected) everConnected.current = true
    wasConnected.current = connected
  }, [connected, requestRecent])

  useEffect(
    () => () => {
      if (recentTimer.current) clearTimeout(recentTimer.current)
    },
    []
  )

  useLiveSyncGuard(() => requestRecent(), { enabled: canChat, pollMs: GUARD_POLL_MS })

  return { connected }
}
