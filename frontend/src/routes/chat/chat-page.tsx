import { useEffect, useLayoutEffect } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"

import { ChatLayout } from "@/components/chat/chat-layout"
import { useFullBleed, useImmersive } from "@/hooks/use-app-shell"
import { useChatListRealtime } from "@/hooks/chat/use-chat-list-realtime"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useChat } from "@/lib/chat/chat-store"
import { useLastChannel, useMessageSelection, useOpenChatStore } from "@/lib/chat/stores"

/**
 * A tela do chat. Esta página vive enquanto a pessoa estiver em `/chat`, com ou sem conversa
 * aberta: trocar de conversa muda o parâmetro, nunca a monta de novo.
 *
 * - `/chat/:chatId`: a conversa aberta.
 * - `?timeline=all`: a aba "Todos", com a linha do tempo de todos os canais do contato.
 * - `?cid=` e `?c=`: o formato de link da origem. Vira `/chat/:chatId`.
 */
export default function ChatPage() {
  const { chatId = null } = useParams<{ chatId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const singleColumn = useIsMobile()
  const { connected } = useChatListRealtime()

  useFullBleed(true)
  // No celular a conversa ocupa a tela toda: o teclado precisa da altura que a barra usaria.
  useImmersive(singleColumn && Boolean(chatId))

  const legacyId = searchParams.get("cid") ?? searchParams.get("c")
  useEffect(() => {
    if (legacyId && !chatId) navigate(`/chat/${legacyId}`, { replace: true })
  }, [chatId, legacyId, navigate])

  const chat = useChat(chatId)
  const externalId = chat?.externalId ?? null

  // Antes da pintura, para a linha selecionada aparecer junto com a conversa.
  useLayoutEffect(() => {
    useOpenChatStore.setState((state) => ({
      chatId,
      externalId,
      matches: externalId && state.externalId === externalId ? state.matches : null,
    }))
    if (chatId && externalId) useLastChannel.getState().remember(externalId, chatId)
  }, [chatId, externalId])

  useEffect(() => {
    useMessageSelection.getState().clear()
  }, [chatId])

  useEffect(
    () => () => {
      useOpenChatStore.setState({ chatId: null, externalId: null, matches: null })
    },
    []
  )

  return <ChatLayout chatId={chatId} connected={connected} />
}
