import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import { useChatNavigation } from "@/hooks/chat-mobile/use-chat-navigation"
import { useBackLayer } from "@/hooks/chat-mobile/use-chat-mobile"
import { useAppShell } from "@/hooks/use-app-shell"
import { useRetained } from "@/hooks/use-panel-session"
import { useDetailsPanel } from "@/lib/chat/stores"
import { useDetailsPrefs } from "@/lib/chat-details/panel-store"
import { installBackStack, openLayerCount } from "@/lib/chat-mobile/back-stack"
import { ChatVariantContext } from "../chat-variant"
import { ChatDetailsPanel, HAS_DETAILS_PANEL } from "../extension-points"
import { MessagesSkeleton } from "../thread/thread-skeleton"
import { MobileListPanel } from "./list-panel"
import { SlidePane } from "./slide-pane"
import { MobileThreadHeaderSkeleton } from "./thread-header-skeleton"
import { MOBILE_VARIANT, preloadThreadParts } from "./variant"
import "./chat-mobile.css"

const ChatThread = lazy(() => import("../thread/chat-thread"))

const THREAD_Z = 32
const DETAILS_Z = 34

/** O gesto de voltar só vale para quem está por cima de tudo. */
const threadOnTop = () => openLayerCount() === 0
const detailsOnTop = () => openLayerCount() === 1

/** A conversa carregando: a seta já funciona, e o composer já tem o lugar dele. */
function ThreadFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileThreadHeaderSkeleton onBack={onBack} />
      <div className="min-h-0 flex-1">
        <MessagesSkeleton />
      </div>
      <div className="shrink-0 border-t p-2 pb-safe">
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </div>
  )
}

/**
 * O chat no celular: três telas empilhadas, lista, conversa e painel do contato. A lista fica sempre
 * montada embaixo, com a rolagem onde estava. A conversa e o painel entram por cima de tudo, inclusive
 * do cabeçalho e da barra da casca, e deslizam para voltar.
 *
 * Coberta, a lista fica congelada no tamanho que tinha. Assim o que muda lá em cima (a casca saindo de
 * cena, o teclado abrindo na conversa) não chega nela, e abrir ou fechar uma conversa não desenha
 * nenhuma linha.
 */
export default function MobileChatLayout({
  chatId,
  connected,
}: {
  chatId: string | null
  connected: boolean
}) {
  const { t } = useTranslation()
  const { goToList } = useChatNavigation(chatId)

  const detailsOpen = useDetailsPanel((state) => state.open)
  const setDetailsOpen = useDetailsPanel((state) => state.setOpen)
  const showsCopilot = useDetailsPrefs((state) => state.tab === "copilot")
  const closeDetails = useCallback(() => setDetailsOpen(false), [setDetailsOpen])
  const showDetails = HAS_DETAILS_PANEL && detailsOpen && (Boolean(chatId) || showsCopilot)

  const shownChat = useRetained(chatId)

  useEffect(() => installBackStack(), [])
  useBackLayer(showDetails, closeDetails)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.chatMobile = ""
    return () => {
      delete root.dataset.chatMobile
    }
  }, [])

  // O painel cobre a conversa: cada conversa abre nela, mesmo que ele tenha ficado aberto da última
  // vez. Antes de pintar, para não piscar.
  useLayoutEffect(() => {
    setDetailsOpen(false)
  }, [chatId, setDetailsOpen])

  // A conversa sai de cena quando o painel termina de entrar; e o painel que abre tira o teclado.
  const [threadSettled, setThreadSettled] = useState(Boolean(chatId))
  const [threadPeeking, setThreadPeeking] = useState(false)
  const [detailsSettled, setDetailsSettled] = useState(false)
  const [detailsPeeking, setDetailsPeeking] = useState(false)

  // Saiu: quem reabrir no meio da saída ainda precisa deslizar de volta, com a lista à vista.
  if (!chatId && threadSettled) setThreadSettled(false)
  if (!showDetails && detailsSettled) setDetailsSettled(false)

  useEffect(() => {
    if (showDetails && document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [showDetails])

  const threadCovers = Boolean(chatId) && threadSettled && !threadPeeking
  const detailsCover = showDetails && detailsSettled && !detailsPeeking
  const listCovered = threadCovers || detailsCover

  // Com a lista fora de vista, a casca sai de cena e a altura volta a ser da conversa: o teclado e o
  // que mais subir aqui precisam dela. No mesmo passo, antes de pintar: a lista reaparece já com a
  // casca no lugar.
  const list = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return

    if (listCovered) {
      element.style.height = `${element.offsetHeight}px`
      useAppShell.setState({ immersive: true })
    } else {
      element.style.height = ""
      useAppShell.setState({ immersive: false })
    }
  }, [listCovered])

  useEffect(
    () => () => {
      useAppShell.setState({ immersive: false })
    },
    []
  )

  // Com o aparelho à toa: a primeira conversa aberta não espera a rede.
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preloadThreadParts, { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = window.setTimeout(preloadThreadParts, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <ChatVariantContext.Provider value={MOBILE_VARIANT}>
      <div
        className="h-full min-h-0"
        style={{ paddingBottom: "max(var(--app-bottom-nav-total, 0px), var(--kb-inset, 0px))" }}
      >
        <div
          ref={list}
          className="chat-list chat-touch h-full min-h-0 pr-safe pl-safe [contain:layout_paint_style]"
          style={{ visibility: listCovered ? "hidden" : undefined }}
        >
          <MobileListPanel connected={connected || Boolean(chatId)} />
        </div>
      </div>

      <SlidePane
        open={Boolean(chatId)}
        covered={detailsCover}
        label={t("chatMobile.panes.thread")}
        zIndex={THREAD_Z}
        canSwipe={threadOnTop}
        onBack={goToList}
        onPeek={setThreadPeeking}
        onSettled={(open) => {
          setThreadSettled(open)
          if (!open) setThreadPeeking(false)
        }}
      >
        {shownChat ? (
          <Suspense fallback={<ThreadFallback onBack={goToList} />}>
            <ChatThread chatId={shownChat} onBack={goToList} />
          </Suspense>
        ) : null}
      </SlidePane>

      <SlidePane
        open={showDetails}
        label={t("chatMobile.panes.details")}
        zIndex={DETAILS_Z}
        canSwipe={detailsOnTop}
        onBack={closeDetails}
        onPeek={setDetailsPeeking}
        onSettled={(open) => {
          setDetailsSettled(open)
          if (!open) setDetailsPeeking(false)
        }}
      >
        <div className="flex h-full min-h-0 flex-col pt-safe">
          <ChatDetailsPanel chatId={chatId} onClose={closeDetails} />
        </div>
      </SlidePane>
    </ChatVariantContext.Provider>
  )
}
