import { useEffect, useRef, type RefObject } from "react"
import { animate, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Reply } from "lucide-react"

import { haptic } from "@/lib/chat-mobile/haptics"
import { useMessageSelection, useThreadUi } from "@/lib/chat/stores"
import { getThreadMessages } from "@/lib/chat/thread-store"
import type { ChatMessage } from "@/lib/chat/types"
import { spring } from "@/lib/motion"
import { useThreadContext } from "../thread/thread-context"
import { EDGE_ZONE_PX } from "./slide-pane"

/** Até aqui não dá para saber se é responder, rolar ou segurar. */
const INTENT_PX = 10
/** Quanto a bolha anda até valer como resposta. */
const COMMIT_PX = 56
/** Daqui em diante ela quase não anda: é o sinal de que já chegou. */
const MAX_PX = 80

const ROW_SELECTOR = "[data-message-id].group\\/message"
const OWN_GESTURE_SELECTOR = 'a, button, video, audio, input, [role="slider"]'

/**
 * Deslizar a bolha para a direita responde, o gesto que todo app de mensagem ensinou. Um ouvinte só,
 * no histórico inteiro, e a bolha anda direto pelo estilo: nada disso passa pelo React, e as bolhas
 * que estão na tela não carregam ouvinte nenhum.
 */
export default function SwipeReply({
  containerRef,
  onReply,
}: {
  containerRef: RefObject<HTMLElement | null>
  onReply: (message: ChatMessage) => void
}) {
  const { t } = useTranslation()
  const { threadKey } = useThreadContext()
  const reduced = useReducedMotion()
  const icon = useRef<HTMLSpanElement>(null)

  const latest = useRef({ onReply, reduced })
  useEffect(() => {
    latest.current = { onReply, reduced }
  })

  useEffect(() => {
    const container = containerRef.current
    const glyphNode = icon.current
    if (!container || !glyphNode) return
    const glyph: HTMLSpanElement = glyphNode

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return
      if (event.clientX <= EDGE_ZONE_PX) return
      if (useMessageSelection.getState().active || useThreadUi.getState().activeMessageId) return

      const target = event.target as Element
      if (target.closest(OWN_GESTURE_SELECTOR)) return
      const rowNode = target.closest<HTMLElement>(ROW_SELECTOR)
      const messageId = rowNode?.dataset.messageId
      if (!rowNode || !messageId) return
      const row: HTMLElement = rowNode

      const message = getThreadMessages(threadKey).find((item) => item.id === messageId)
      if (!message || message.deletedAt) return

      const { pointerId, clientX: startX, clientY: startY } = event
      let active = false
      let reached = false
      let shift = 0

      const stop = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onCancel)
      }

      const release = () => {
        glyph.style.opacity = "0"
        if (latest.current.reduced) {
          row.style.transform = ""
          return
        }
        void animate(row, { transform: [`translateX(${shift}px)`, "translateX(0px)"] }, spring).then(
          () => {
            row.style.transform = ""
          }
        )
      }

      function onMove(move: PointerEvent) {
        if (move.pointerId !== pointerId) return
        const dx = move.clientX - startX
        const dy = move.clientY - startY

        if (!active) {
          if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return
          if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
            stop()
            return
          }
          active = true
          const box = row.getBoundingClientRect()
          glyph.style.top = `${box.top + box.height / 2 - 16}px`
        }

        // Até o ponto de valer anda com o dedo; depois disso, resiste.
        shift = dx <= COMMIT_PX ? dx : Math.min(COMMIT_PX + (dx - COMMIT_PX) * 0.25, MAX_PX)
        shift = Math.max(shift, 0)
        if (!latest.current.reduced) row.style.transform = `translateX(${shift}px)`
        glyph.style.opacity = String(Math.min(shift / COMMIT_PX, 1))

        const nowReached = shift >= COMMIT_PX
        if (nowReached && !reached) haptic()
        reached = nowReached
      }

      function onUp(up: PointerEvent) {
        if (up.pointerId !== pointerId) return
        stop()
        if (!active) return
        release()
        // Dentro do gesto: é o que deixa o iOS subir o teclado para a resposta.
        if (reached && message) latest.current.onReply(message)
      }

      function onCancel(cancel: PointerEvent) {
        if (cancel.pointerId !== pointerId) return
        stop()
        if (active) release()
      }

      window.addEventListener("pointermove", onMove, { passive: true })
      window.addEventListener("pointerup", onUp, { passive: true })
      window.addEventListener("pointercancel", onCancel, { passive: true })
    }

    container.addEventListener("pointerdown", onPointerDown, { passive: true })
    return () => container.removeEventListener("pointerdown", onPointerDown)
  }, [containerRef, threadKey])

  return (
    <span
      ref={icon}
      aria-hidden
      title={t("chat.message.reply")}
      className="pointer-events-none fixed left-3 z-10 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-0"
    >
      <Reply className="size-4" />
    </span>
  )
}
