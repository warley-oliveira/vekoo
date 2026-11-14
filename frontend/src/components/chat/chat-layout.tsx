import { lazy, memo, Suspense, useCallback, useState, type ReactNode } from "react"
import { useNavigate } from "@/lib/router"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { MessageSquarePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useChatMobile } from "@/hooks/chat-mobile/use-chat-mobile"
import { useDetailsPanel } from "@/lib/chat/stores"
import { useDetailsPrefs } from "@/lib/chat-details/panel-store"
import { useMotionPreset } from "@/lib/motion"
import { ChatDetailsPanel, HAS_DETAILS_PANEL } from "./extension-points"
import { ListPanel } from "./list/list-panel"
import { ChatListSkeleton } from "./list/row-parts"
import { ConversationArt } from "./thread/conversation-art"
import { ThreadSkeleton } from "./thread/thread-skeleton"
import "./chat-surface.css"

// A conversa pesa (lista virtual, player, composer) e nem sempre é aberta no primeiro segundo.
const ChatThread = lazy(() => import("./thread/chat-thread"))
// Dedo e polegar: só desce para quem está no celular.
const MobileChatLayout = lazy(() => import("./mobile/mobile-chat-layout"))
const NewChatDialog = lazy(() => import("./list/new-chat-dialog"))

/**
 * Nenhuma conversa aberta. Já no fundo da conversa, com a ilustração das duas bolhas: a coluna
 * avisa o que vai aparecer ali. A chamada é começar uma conversa, que é o que dá para fazer sem
 * escolher uma da lista.
 */
function NoChatSelected() {
  const { t } = useTranslation()
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatEverOpen, setNewChatEverOpen] = useState(false)

  return (
    <div className="chat-surface flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <ConversationArt />
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {t("chat.thread.noneTitle")}
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground">{t("chat.thread.noneHint")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-card pointer-coarse:h-10"
          onClick={() => {
            setNewChatEverOpen(true)
            setNewChatOpen(true)
          }}
        >
          <MessageSquarePlus />
          {t("chat.list.newChat")}
        </Button>
      </div>
      {newChatEverOpen ? (
        <Suspense fallback={null}>
          <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
        </Suspense>
      ) : null}
    </div>
  )
}

/** Trocas mais próximas que isto são alguém passando pela lista: a conversa só aparece, sem animar. */
const QUICK_SWITCH_MS = 220

let lastThreadEntryAt = 0

/**
 * A conversa que acabou de ser escolhida entra com um fade e um deslocamento curto, vindo do lado da
 * lista: diz "abriu esta", sem as mensagens entrarem uma a uma (elas já estão lá). Uma por conversa,
 * por `key`: a anterior sai na hora, então trocar rápido nunca empilha animação. Quem troca muito
 * depressa (teclado, cliques seguidos) não vê movimento nenhum, e nada pisca. O primeiro desenho da
 * tela não anima.
 */
function ThreadEntry({ animate, children }: { animate: boolean; children: ReactNode }) {
  const preset = useMotionPreset()
  const [enter] = useState(() => {
    const now = performance.now()
    const quick = now - lastThreadEntryAt < QUICK_SWITCH_MS
    lastThreadEntryAt = now
    return animate && !quick
  })

  if (!enter) return <div className="h-full min-h-0">{children}</div>

  return (
    <motion.div
      className="h-full min-h-0"
      initial={preset.reduced ? { opacity: 0.6 } : { opacity: 0.4, x: -10 }}
      animate={preset.reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
      transition={preset.reduced ? { duration: 0.15, ease: "easeOut" } : preset.spring}
    >
      {children}
    </motion.div>
  )
}

/**
 * As colunas da tela larga: lista, conversa e o painel lateral. A partir do tablet, lista e conversa
 * ficam lado a lado.
 */
const WideChatLayout = memo(function WideChatLayout({
  chatId,
  connected,
}: {
  chatId: string | null
  connected: boolean
}) {
  const navigate = useNavigate()
  const detailsOpen = useDetailsPanel((state) => state.open)
  const setDetailsOpen = useDetailsPanel((state) => state.setOpen)
  // O copiloto é o único assunto do painel que não precisa de conversa aberta.
  const showsCopilot = useDetailsPrefs((state) => state.tab === "copilot")

  const closeDetails = useCallback(() => setDetailsOpen(false), [setDetailsOpen])
  const goToList = useCallback(() => navigate("/chat"), [navigate])

  const showDetails = HAS_DETAILS_PANEL && detailsOpen && (Boolean(chatId) || showsCopilot)

  // A conversa da abertura da tela (link direto, recarregar) já nasce no lugar; daí em diante, cada
  // troca anima.
  const [openedWith, setOpenedWith] = useState<string | null | undefined>(chatId)
  if (openedWith !== undefined && chatId !== openedWith) setOpenedWith(undefined)
  const animateEntry = openedWith === undefined

  const preset = useMotionPreset()
  const panelMotion = preset.reduced
    ? preset.fade
    : {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 24 },
        transition: preset.spring,
      }

  return (
    <div
      className="@container/chat flex h-full min-h-0 [contain:layout_paint_style]"
      style={{ paddingBottom: "max(var(--app-bottom-nav-total, 0px), var(--kb-inset, 0px))" }}
    >
      <aside className="min-h-0 w-full shrink-0 border-r md:w-[20rem] lg:w-[22.5rem]">
        {/* Com uma conversa aberta, quem avisa da conexão é ela: duas faixas iguais só fariam barulho. */}
        <ListPanel connected={connected || Boolean(chatId)} />
      </aside>

      <section className="min-h-0 min-w-0 flex-1 bg-background">
        {chatId ? (
          <ThreadEntry key={chatId} animate={animateEntry}>
            <Suspense fallback={<ThreadSkeleton withHeader />}>
              <ChatThread chatId={chatId} onBack={goToList} />
            </Suspense>
          </ThreadEntry>
        ) : (
          <NoChatSelected />
        )}
      </section>

      {/* Terceira coluna só onde a conversa continua legível ao lado dela: em tela mais estreita, o
          painel entra por cima, para não deixar o histórico com a largura de um rodapé. */}
      <AnimatePresence initial={false}>
        {showDetails ? (
          <motion.aside
            key="details"
            {...panelMotion}
            className="min-h-0 w-full shrink-0 border-l bg-background md:w-[22rem] @max-[62rem]/chat:absolute @max-[62rem]/chat:inset-y-0 @max-[62rem]/chat:right-0 @max-[62rem]/chat:z-20 @max-[62rem]/chat:shadow-lg"
          >
            <ChatDetailsPanel chatId={chatId} onClose={closeDetails} />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  )
})

/** Tela larga ou celular. Cruzar o corte remonta a tela: o estado mora nos stores e sobrevive. */
export const ChatLayout = memo(function ChatLayout({
  chatId,
  connected,
}: {
  chatId: string | null
  connected: boolean
}) {
  const mobile = useChatMobile()

  if (mobile) {
    return (
      <Suspense fallback={<ChatListSkeleton />}>
        <MobileChatLayout chatId={chatId} connected={connected} />
      </Suspense>
    )
  }

  return <WideChatLayout chatId={chatId} connected={connected} />
})
