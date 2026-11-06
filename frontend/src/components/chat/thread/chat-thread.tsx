import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ImageUp, SearchX, WifiOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useChatThread } from "@/hooks/chat/use-chat-thread"
import { useContactChats } from "@/hooks/chat/use-contact-chats"
import { useLiveSyncGuard } from "@/hooks/chat/use-live-sync-guard"
import { useOpenChat } from "@/hooks/chat/use-open-chat"
import { useSendMessage } from "@/hooks/chat/use-send-message"
import { useChannel } from "@/hooks/use-channel"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { deleteMessages, reactToMessage } from "@/lib/chat/actions"
import { channelKey, connectorNumber, type ChatConnector } from "@/lib/chat/channel"
import { chatDisplayName } from "@/lib/chat/chat-store"
import { composerMode } from "@/lib/chat/composer-mode"
import { bubbleText, type MessageCapabilities } from "@/lib/chat/message-rules"
import { useLastChannel, useOpenChatStore, useReplyTo } from "@/lib/chat/stores"
import {
  applyChannelMessage,
  loadThread,
  receiveMessage,
  resyncThread,
  setOpenThread,
  useThreadStore,
} from "@/lib/chat/thread-store"
import type { ChatChannelMessage, ChatMessage, UnifiedContactChat } from "@/lib/chat/types"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ChannelIcon } from "../channel-icon"
import { Composer, ReadOnlyNotice, type ComposerHandle } from "../composer/composer"
import { MediaViewer } from "../media/media-viewer"
import { DeleteMessagesDialog } from "./delete-messages-dialog"
import { MessageList, type MessageListHandle } from "./message-list"
import { SelectionBar } from "./selection-bar"
import { ThreadContext, type ThreadContextValue } from "./thread-context"
import { ThreadHeader } from "./thread-header"
import { MessagesSkeleton, ThreadHeaderSkeleton } from "./thread-skeleton"
import { ALL_CHATS_TAB, ThreadTabs } from "./thread-tabs"

const TIMELINE_PARAM = "timeline"
const TIMELINE_ALL = "all"

/** Uma conversa de um canal: histórico, composer e tudo que age sobre uma mensagem. */
const Conversation = memo(function Conversation({
  chatId,
  connector,
  contactName,
  contactPicture,
  mode,
}: {
  chatId: string
  connector: ChatConnector | undefined
  contactName: string
  contactPicture: string | null
  mode: ReturnType<typeof composerMode>
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const senderName = useAuth().session?.account.name
  const list = useRef<MessageListHandle>(null)
  const composer = useRef<ComposerHandle>(null)

  const { connected, retry: retryLoad } = useChatThread(chatId)
  const { send, retryOutgoing } = useSendMessage(chatId)
  const provider = useThreadStore((state) => state.threads[chatId]?.connectorProvider ?? null)

  const [deleting, setDeleting] = useState<ChatMessage[] | null>(null)
  const [dragging, setDragging] = useState(false)

  const capabilities = useMemo<MessageCapabilities>(
    () => ({ connector, provider }),
    [connector, provider]
  )

  const context = useMemo<ThreadContextValue>(
    () => ({
      threadKey: chatId,
      chatId,
      contactName,
      contactPicture,
      capabilities,
      reply: (message) => {
        useReplyTo.getState().setReplyTo(chatId, message)
        composer.current?.focus()
      },
      react: (message, emoji) => {
        reactToMessage(chatId, message, emoji, senderName).catch((error: unknown) => {
          toast.error(
            error instanceof ApiError && error.serverMessage
              ? error.serverMessage
              : t("chat.message.reactFailed")
          )
        })
      },
      requestDelete: setDeleting,
      retry: (message) => {
        const input = {
          payload: message.content ?? "",
          text: bubbleText(message),
          replyToMessageId: message.replyToMessageId ?? null,
        }
        if (message.id.startsWith("local-")) {
          retryOutgoing(message.id, input)
        } else {
          // A tentativa nova toma o lugar da que falhou: sem isto, a conversa guardaria as duas, e
          // a falha continuaria pedindo uma ação que já foi feita. Tirar é só para quem vê.
          void deleteMessages(chatId, [message.id], "me").catch(() => {})
          send(input)
        }
        list.current?.scrollToBottom()
      },
      scrollToMessage: (id) => void list.current?.scrollToMessage(id),
    }),
    [capabilities, chatId, contactName, contactPicture, retryOutgoing, send, senderName, t]
  )

  // Quem envia quer ver o que enviou, mesmo tendo rolado para cima.
  const onSent = useCallback(() => list.current?.scrollToBottom(), [])

  // Quem começa a digitar com o foco no histórico quer escrever: a tecla vai para a caixa de texto.
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (mode !== "compose" || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key.length !== 1 || target.closest("input, textarea, [contenteditable='true']")) return
    if (target.closest("button, a, [role='slider'], [role='menu'], [role='dialog']")) return
    composer.current?.focus()
  }

  const onDragOver = (event: DragEvent) => {
    if (mode !== "compose" || !event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }
  const onDrop = (event: DragEvent) => {
    if (mode !== "compose") return
    event.preventDefault()
    setDragging(false)
    composer.current?.addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <ThreadContext.Provider value={context}>
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
      >
        {!connected ? <ReconnectingNotice /> : null}

        <motion.div key={chatId} {...preset.fade} className="min-h-0 flex-1">
          <MessageList ref={list} threadKey={chatId} onRetry={retryLoad} />
        </motion.div>

        <AnimatePresence>
          {dragging ? (
            <motion.div
              key="drop"
              {...preset.fade}
              className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium"
            >
              <ImageUp aria-hidden className="size-6 text-primary" />
              {t("chat.composer.dropHere")}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Composer
          ref={composer}
          chatId={chatId}
          mode={mode}
          contactName={contactName}
          onSent={onSent}
        />
      </div>

      <SelectionBar threadKey={chatId} onDelete={setDeleting} />
      <MediaViewer />

      {deleting ? (
        <DeleteMessagesDialog
          chatId={chatId}
          messages={deleting}
          capabilities={capabilities}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </ThreadContext.Provider>
  )
})

/** Só depois de um tempo: a conexão pisca ao abrir a conversa, e isso não é notícia. */
function ReconnectingNotice() {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 4_000)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <p
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-status-warning-soft px-4 py-1.5 text-xs text-status-warning"
    >
      <WifiOff aria-hidden className="size-3.5" />
      {t("chat.thread.reconnecting")}
    </p>
  )
}

/** Assina o canal de uma conversa: um por conversa do contato, na aba "Todos". */
function TimelineSubscription({
  threadKey,
  chat,
}: {
  threadKey: string
  chat: UnifiedContactChat
}) {
  useChannel<ChatChannelMessage>("ChatChannel", { chatId: chat.chatId }, (payload) => {
    if (payload && typeof payload === "object" && !("event" in payload) && "id" in payload) {
      // O evento não diz de que canal veio; a assinatura sabe.
      receiveMessage(threadKey, {
        ...(payload as ChatMessage),
        connectorId: chat.connectorId,
        senderPhoneNumberId: chat.senderPhoneNumberId,
      })
    } else {
      applyChannelMessage(threadKey, payload)
    }
  })
  return null
}

/**
 * A aba "Todos": todas as conversas do contato, numa linha do tempo só de leitura. Cada bolha diz de
 * que canal veio, e a de um canal que não casou com o filtro fica em cinza.
 */
const AllChannelsTimeline = memo(function AllChannelsTimeline({
  externalId,
  chats,
  connectors,
  contactName,
  contactPicture,
}: {
  externalId: string
  chats: UnifiedContactChat[]
  connectors: Map<string, ChatConnector>
  contactName: string
  contactPicture: string | null
}) {
  const threadKey = `contact:${externalId}`
  const list = useRef<MessageListHandle>(null)

  useEffect(() => {
    setOpenThread(threadKey)
    const thread = useThreadStore.getState().threads[threadKey]
    if (!thread || thread.status === "error") void loadThread(threadKey)
    else if (thread.status === "ready") void resyncThread(threadKey)
    return () => setOpenThread(null)
  }, [threadKey])

  useLiveSyncGuard(() => void resyncThread(threadKey), { pollMs: 30_000 })

  const unmatched = useMemo(
    () => new Set(chats.filter((chat) => !chat.matched).map((chat) => chat.chatId)),
    [chats]
  )

  const context = useMemo<ThreadContextValue>(
    () => ({
      threadKey,
      chatId: null,
      contactName,
      contactPicture,
      capabilities: { connector: undefined, provider: null },
      reply: () => {},
      react: () => {},
      requestDelete: () => {},
      retry: () => {},
      scrollToMessage: (id) => void list.current?.scrollToMessage(id),
      renderOrigin: (message) => {
        const connector = message.connectorId ? connectors.get(message.connectorId) : undefined
        const channel = channelKey(connector, null)
        const number = connectorNumber(connector, message.senderPhoneNumberId)
        return (
          <span
            className={cn(
              "flex items-center gap-1 text-[0.6875rem] text-muted-foreground",
              unmatched.has(message.chatId) && "opacity-50 grayscale"
            )}
          >
            <ChannelIcon channel={channel} className="size-3" />
            {number ?? connector?.name}
          </span>
        )
      },
    }),
    [connectors, contactName, contactPicture, threadKey, unmatched]
  )

  return (
    <ThreadContext.Provider value={context}>
      {chats.map((chat) => (
        <TimelineSubscription key={chat.chatId} threadKey={threadKey} chat={chat} />
      ))}
      <div className="min-h-0 flex-1">
        <MessageList ref={list} threadKey={threadKey} onRetry={() => void loadThread(threadKey)} />
      </div>
      <MediaViewer />
    </ThreadContext.Provider>
  )
})

function ThreadNotFound({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <SearchX aria-hidden className="size-5 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("chat.thread.notFound")}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{t("chat.thread.notFoundHint")}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onBack}>
        {t("chat.thread.backToList")}
      </Button>
    </div>
  )
}

/**
 * A conversa aberta. Vive em um chunk próprio e recebe só o id: lê a conversa do store, e nada aqui
 * se desenha quando outra conversa da lista muda.
 */
export default function ChatThread({
  chatId,
  singleColumn,
  onBack,
}: {
  chatId: string
  singleColumn: boolean
  onBack: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { chat, error, retry } = useOpenChat(chatId)
  const { byId: connectors } = useChatConnectors()
  const matches = useOpenChatStore((state) => state.matches)

  const notFound = error instanceof ApiError && error.status === 404
  const connector = chat?.connectorId ? connectors.get(chat.connectorId) : undefined
  const channel = chat ? channelKey(connector, chat.audienceType) : "other"

  // O visitante do widget só fala por um canal, e o identificador dele não é telefone.
  const contactChats = useContactChats(chat?.externalId, {
    enabled: Boolean(chat) && channel !== "web",
    matches: matches ?? undefined,
  })

  const showTabs = contactChats.length > 1
  const showTimeline = showTabs && searchParams.get(TIMELINE_PARAM) === TIMELINE_ALL

  const contactName = chat
    ? chatDisplayName(chat, {
        visitor: t("chat.contact.visitor"),
        contact: t("chat.contact.fallback"),
      })
    : ""
  useDocumentTitle(contactName || null)

  const onTabChange = useCallback(
    (tab: string) => {
      if (tab === ALL_CHATS_TAB) {
        navigate(`/chat/${chatId}?${TIMELINE_PARAM}=${TIMELINE_ALL}`)
        return
      }
      if (chat) useLastChannel.getState().remember(chat.externalId, tab)
      navigate(`/chat/${tab}`)
    },
    [chat, chatId, navigate]
  )

  const mode = composerMode(chat?.partial ? undefined : chat, connector)

  if (notFound) return <ThreadNotFound onBack={onBack} />

  if (error && !chat) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("chat.thread.loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t("chat.thread.retry")}
        </Button>
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ThreadHeaderSkeleton />
        <div className="min-h-0 flex-1">
          <MessagesSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ThreadHeader chat={chat} connector={connector} singleColumn={singleColumn} onBack={onBack} />

      {showTabs ? (
        <ThreadTabs
          chats={contactChats}
          connectors={connectors}
          value={showTimeline ? ALL_CHATS_TAB : chatId}
          onChange={onTabChange}
        />
      ) : null}

      {showTimeline ? (
        <>
          <AllChannelsTimeline
            externalId={chat.externalId}
            chats={contactChats}
            connectors={connectors}
            contactName={contactName}
            contactPicture={chat.profilePictureUrl}
          />
          <ReadOnlyNotice />
        </>
      ) : (
        <Conversation
          key={chatId}
          chatId={chatId}
          connector={connector}
          contactName={contactName}
          contactPicture={chat.profilePictureUrl}
          mode={mode}
        />
      )}
    </div>
  )
}

