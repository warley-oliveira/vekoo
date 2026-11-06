import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"

import { useChannel } from "@/hooks/use-channel"
import { apiPost } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { getChat, patchChat, publishChat, useChatStore } from "@/lib/chat/chat-store"
import {
  applyChannelMessage,
  loadOlder,
  loadThread,
  resyncThread,
  setOpenThread,
  useThreadStore,
} from "@/lib/chat/thread-store"
import type { Chat, ChatChannelMessage, ChatResponse } from "@/lib/chat/types"

/** Tempo para o canal da conversa entregar o que a lista já contou, antes de buscar. */
const STALE_GRACE_MS = 1_500
/** Um pedido por rajada de mensagens. */
const READ_DEBOUNCE_MS = 600

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener)
  return () => document.removeEventListener("visibilitychange", listener)
}

function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible")
}

/**
 * Liga a tela à conversa: abre, assina `ChatChannel`, busca só o que precisa e zera as não lidas.
 * O histórico em si se lê de `useThreadStore`, com seletor, em quem desenha.
 *
 * Uma conversa já carregada e sem novidade não gera requisição nenhuma ao voltar para ela.
 */
export function useChatThread(chatId: string) {
  const status = useThreadStore((state) => state.threads[chatId]?.status ?? "loading")
  const stale = useThreadStore((state) => state.threads[chatId]?.stale ?? false)
  const accountId = useAuth().session?.account.id

  const handleMessage = useCallback(
    (message: ChatChannelMessage) => applyChannelMessage(chatId, message),
    [chatId]
  )

  const { connected, perform } = useChannel<ChatChannelMessage>(
    "ChatChannel",
    { chatId },
    handleMessage
  )

  // Abrir: primeira vez busca; com novidade contada pela lista, busca a janela; senão, nada.
  useEffect(() => {
    setOpenThread(chatId)

    const thread = useThreadStore.getState().threads[chatId]
    if (!thread || thread.status === "error") void loadThread(chatId)
    else if (thread.stale) void resyncThread(chatId, { markRead: true })

    return () => setOpenThread(null)
  }, [chatId])

  // A lista contou uma mensagem que o canal não entregou: dá um tempo e confere.
  useEffect(() => {
    if (!stale || status !== "ready") return
    const timer = setTimeout(() => void resyncThread(chatId, { markRead: true }), STALE_GRACE_MS)
    return () => clearTimeout(timer)
  }, [chatId, stale, status])

  // O canal não reenvia o que passou com o socket caído. Na volta (nunca na primeira conexão,
  // que a busca inicial cobre), busca a janela e funde.
  const connection = useRef({ chatId, ever: false, was: false })
  useEffect(() => {
    const seen = connection.current
    if (seen.chatId !== chatId) connection.current = { chatId, ever: false, was: false }
    const now = connection.current

    if (connected && now.ever && !now.was) void resyncThread(chatId, { markRead: true })
    if (connected) now.ever = true
    now.was = connected
  }, [chatId, connected])

  useMarkAsRead(chatId, accountId, status === "ready")

  const loadOlderMessages = useCallback(() => void loadOlder(chatId), [chatId])
  const retry = useCallback(() => void loadThread(chatId), [chatId])

  return { status, connected, perform, loadOlderMessages, retry }
}

/**
 * Enquanto a conversa está na tela, com a aba visível, o que chega já foi lido. Só zera de quem é
 * dono ou de conversa sem dono: abrir a conversa de outra pessoa não apaga o aviso dela.
 */
function useMarkAsRead(chatId: string, accountId: string | undefined, ready: boolean) {
  const visible = useDocumentVisible()
  const unread = useChatStore((state) => state.byId[chatId]?.unreadMessages ?? 0)
  const assigned = useChatStore((state) => state.byId[chatId]?.assignedAccountId)
  const canClear = !assigned || assigned === accountId

  useEffect(() => {
    if (!ready || !visible || unread === 0 || !canClear) return

    const timer = setTimeout(() => {
      patchChat(chatId, { unreadMessages: 0 })
      apiPost<ChatResponse>(`/chats/${chatId}/read`)
        .then(({ chat }) => publishChat(chat))
        .catch(() => {
          // Volta a tentar quando chegar a próxima mensagem. Não vale incomodar a pessoa.
        })
    }, READ_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [canClear, chatId, ready, unread, visible])
}

/** A conversa como está agora, sem assinar: para os callbacks. */
export function currentChat(chatId: string): Chat | undefined {
  return getChat(chatId)
}
