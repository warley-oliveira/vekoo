import { lazy, memo, Suspense, useCallback, useLayoutEffect } from "react"
import { useNavigate } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { MessagesSquare } from "lucide-react"

import { MOBILE_QUERY, useIsMobile } from "@/hooks/use-is-mobile"
import { useDetailsPanel } from "@/lib/chat/stores"
import { useDetailsPrefs } from "@/lib/chat-details/panel-store"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ChatDetailsPanel, HAS_DETAILS_PANEL } from "./extension-points"
import { ListPanel } from "./list/list-panel"
import { ThreadSkeleton } from "./thread/thread-skeleton"

// A conversa pesa (lista virtual, player, composer) e nem sempre é aberta no primeiro segundo.
const ChatThread = lazy(() => import("./thread/chat-thread"))

function NoChatSelected() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessagesSquare aria-hidden className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {t("chat.thread.noneTitle")}
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">{t("chat.thread.noneHint")}</p>
      </div>
    </div>
  )
}

/**
 * As colunas: lista, conversa e o painel lateral. Em tablet para cima, lista e conversa ficam lado
 * a lado. No celular é uma coluna só, alternando as duas; a lista continua montada por baixo, para
 * voltar da conversa exatamente onde estava.
 */
export const ChatLayout = memo(function ChatLayout({
  chatId,
  connected,
}: {
  chatId: string | null
  connected: boolean
}) {
  const navigate = useNavigate()
  const singleColumn = useIsMobile()
  const detailsOpen = useDetailsPanel((state) => state.open)
  const setDetailsOpen = useDetailsPanel((state) => state.setOpen)
  // O copiloto é o único assunto do painel que não precisa de conversa aberta.
  const showsCopilot = useDetailsPrefs((state) => state.tab === "copilot")

  const closeDetails = useCallback(() => setDetailsOpen(false), [setDetailsOpen])
  const goToList = useCallback(() => navigate("/chat"), [navigate])

  // No celular o painel cobre a conversa: cada conversa abre nela, mesmo que ele tenha ficado aberto
  // da última vez. Antes de pintar, para não piscar. Só ao abrir: estreitar a janela não fecha nada.
  useLayoutEffect(() => {
    if (window.matchMedia(MOBILE_QUERY).matches) setDetailsOpen(false)
  }, [chatId, setDetailsOpen])

  const showDetails = HAS_DETAILS_PANEL && detailsOpen && (Boolean(chatId) || showsCopilot)

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
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 border-r md:w-[20rem] lg:w-[22.5rem]",
          singleColumn && chatId && "hidden"
        )}
      >
        {/* Com uma conversa aberta, quem avisa da conexão é ela: duas faixas iguais só fariam barulho. */}
        <ListPanel connected={connected || Boolean(chatId)} />
      </aside>

      <section
        className={cn("min-h-0 min-w-0 flex-1 bg-background", singleColumn && !chatId && "hidden")}
      >
        {chatId ? (
          <Suspense fallback={<ThreadSkeleton withHeader />}>
            <ChatThread chatId={chatId} singleColumn={singleColumn} onBack={goToList} />
          </Suspense>
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
            className="min-h-0 w-full shrink-0 border-l bg-background max-md:absolute max-md:inset-0 max-md:z-20 md:w-[22rem] @max-[62rem]/chat:absolute @max-[62rem]/chat:inset-y-0 @max-[62rem]/chat:right-0 @max-[62rem]/chat:z-20 @max-[62rem]/chat:shadow-lg"
          >
            <ChatDetailsPanel chatId={chatId} onClose={closeDetails} />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  )
})
