import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react"

import { haptic } from "@/lib/chat-mobile/haptics"
import type { useChatRecorder } from "@/hooks/chat/use-chat-recorder"

/** Solto antes disso, foi um toque: a gravação continua sozinha, com lixeira e enviar à mostra. */
const TAP_MS = 700
/** Deslizar para a esquerda até aqui descarta. */
const CANCEL_PX = 110
/** Deslizar para cima até aqui trava: dá para soltar o dedo e continuar gravando. */
const LOCK_PX = 72
/** O clique que o navegador gera depois de soltar o dedo chega logo em seguida. */
const CLICK_AFTER_RELEASE_MS = 400

export type HoldMode = "idle" | "hold" | "locked"

type Recorder = ReturnType<typeof useChatRecorder>

/**
 * Gravar áudio de dois jeitos, no mesmo botão. Tocar começa a gravar, e a pessoa decide depois.
 * Segurar grava enquanto o dedo estiver lá: soltar envia, para a esquerda descarta, para cima trava.
 *
 * A gravação começa já no toque, sem esperar saber qual dos dois é: as primeiras palavras não podem
 * se perder enquanto o app decide. Quando a permissão do microfone ainda não foi dada, o aviso do
 * sistema interrompe o dedo: aí a gravação começa travada, para nada se perder.
 */
export function useHoldToRecord(
  recorder: Recorder,
  { hint, onLock }: { hint: RefObject<HTMLElement | null>; onLock: () => void }
) {
  const [mode, setMode] = useState<HoldMode>("idle")
  const press = useRef<{ id: number; x: number; y: number; at: number } | null>(null)
  const pointerHandled = useRef(false)
  const releaseTimer = useRef(0)

  const latest = useRef({ recorder, onLock, mode })
  useEffect(() => {
    latest.current = { recorder, onLock, mode }
  })

  useEffect(() => {
    if (recorder.isRecording) {
      // Se o dedo já saiu antes de o microfone responder, foi um toque.
      const next = press.current ? "hold" : "locked"
      setMode(next)
      if (next === "locked") latest.current.onLock()
    } else if (!recorder.isBusy) {
      setMode("idle")
    }
  }, [recorder.isBusy, recorder.isRecording])

  const paintHint = useCallback(
    (dx: number) => {
      const element = hint.current
      if (!element) return
      const shift = Math.min(dx, 0)
      element.style.transform = `translateX(${shift}px)`
      element.style.opacity = String(Math.max(1 + shift / CANCEL_PX, 0.2))
    },
    [hint]
  )

  const lock = useCallback(() => {
    press.current = null
    setMode("locked")
    latest.current.onLock()
  }, [])

  useEffect(() => () => window.clearTimeout(releaseTimer.current), [])

  const expectClick = useCallback(() => {
    window.clearTimeout(releaseTimer.current)
    releaseTimer.current = window.setTimeout(() => {
      pointerHandled.current = false
    }, CLICK_AFTER_RELEASE_MS)
  }, [])

  const onPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") return
    pointerHandled.current = true

    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() }
    haptic()
    void latest.current.recorder.start()
  }, [])

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const held = press.current
      if (!held || held.id !== event.pointerId || latest.current.mode !== "hold") return

      const dx = event.clientX - held.x
      const dy = event.clientY - held.y
      paintHint(dx)

      if (dx < -CANCEL_PX) {
        press.current = null
        haptic(20)
        latest.current.recorder.cancel()
        paintHint(0)
      } else if (dy < -LOCK_PX) {
        haptic()
        paintHint(0)
        lock()
      }
    },
    [lock, paintHint]
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const held = press.current
      expectClick()
      if (!held || held.id !== event.pointerId) return
      press.current = null
      paintHint(0)

      const { recorder: current } = latest.current
      // O microfone ainda não respondeu: quando responder, a gravação nasce travada.
      if (!current.isRecording) return

      if (performance.now() - held.at < TAP_MS) lock()
      else current.stopAndSend()
    },
    [expectClick, lock, paintHint]
  )

  // O sistema tomou o dedo (ligação, gesto da barra): não vale como soltar, e nada se perde.
  const onPointerCancel = useCallback(() => {
    expectClick()
    if (!press.current) return
    paintHint(0)
    if (latest.current.recorder.isRecording) lock()
    else press.current = null
  }, [expectClick, lock, paintHint])

  /** Mouse, teclado e leitor de tela não seguram: para eles é sempre um toque. */
  const onClick = useCallback(() => {
    // O dedo já começou a gravar lá no toque: este é só o clique que vem depois dele.
    if (pointerHandled.current) {
      pointerHandled.current = false
      return
    }
    if (!latest.current.recorder.isBusy) void latest.current.recorder.start()
  }, [])

  /**
   * Enviar: toma o lugar do microfone no mesmo botão. O clique do toque que começou a gravar pode
   * chegar depois da troca, e esse não pode enviar o áudio que acabou de nascer.
   */
  const send = useCallback(() => {
    if (pointerHandled.current) {
      pointerHandled.current = false
      return
    }
    latest.current.recorder.stopAndSend()
  }, [])

  return {
    mode,
    send,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick },
  }
}
