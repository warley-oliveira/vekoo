import { useCallback, useEffect, useRef, useState } from "react"

import { sendAudio } from "@/lib/chat/actions"

export type RecorderStatus = "idle" | "recording" | "sending" | "denied" | "error"

/** O aviso de microfone negado ou falha de envio fica esse tempo. */
const NOTICE_TIMEOUT_MS = 4_000
/** O teto da API é 16 MB. A 128 kbps, 15 minutos ficam com folga. */
const MAX_SECONDS = 15 * 60

/** Os formatos que os navegadores gravam, na ordem do que o WhatsApp lida melhor depois da conversão. */
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]

function pickMimeType(): string | undefined {
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type))
}

function extensionOf(type: string): string {
  if (type.includes("ogg")) return "ogg"
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a"
  return "webm"
}

/**
 * A gravação, só o estado, sem tela. Fica fora do botão de microfone porque quem grava precisa ser
 * dono da linha do composer, para dar lugar ao gravador. O servidor converte para o que o canal
 * aceita; aqui o arquivo vai com o tipo real. Trocar de conversa no meio descarta o que foi gravado.
 */
export function useChatRecorder({
  chatId,
  onSent,
  onSendFailed,
}: {
  chatId: string
  onSent?: () => void
  onSendFailed?: (error: unknown) => void
}) {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const chunks = useRef<Blob[]>([])
  const cancelled = useRef(false)
  const startedAt = useRef(0)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const starting = useRef(false)

  const statusRef = useRef<RecorderStatus>("idle")
  const applyStatus = useCallback((next: RecorderStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const latest = useRef({ chatId, onSent, onSendFailed })
  useEffect(() => {
    latest.current = { chatId, onSent, onSendFailed }
  })

  const clearTick = useCallback(() => {
    if (tick.current) clearInterval(tick.current)
    tick.current = null
  }, [])

  /** Desliga microfone e contexto: sem isso, o indicador do sistema fica aceso. */
  const releaseDevices = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (contextRef.current && contextRef.current.state !== "closed") {
      void contextRef.current.close().catch(() => {})
    }
    contextRef.current = null
    setAnalyser(null)
  }, [])

  const scheduleNoticeDismiss = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => {
      if (statusRef.current === "denied" || statusRef.current === "error") applyStatus("idle")
    }, NOTICE_TIMEOUT_MS)
  }, [applyStatus])

  /** No `onstop` do gravador, quando os pedaços já foram todos entregues. */
  const finalize = useCallback(
    async (recordedFor: string, type: string) => {
      clearTick()
      const pieces = chunks.current
      chunks.current = []
      releaseDevices()

      if (cancelled.current || pieces.length === 0) {
        applyStatus("idle")
        return
      }

      try {
        const blob = new Blob(pieces, { type })
        await sendAudio(recordedFor, blob, `audio.${extensionOf(type)}`)
        latest.current.onSent?.()
        applyStatus("idle")
      } catch (error) {
        latest.current.onSendFailed?.(error)
        applyStatus("error")
        scheduleNoticeDismiss()
      }
    },
    [applyStatus, clearTick, releaseDevices, scheduleNoticeDismiss]
  )

  const stopAndSend = useCallback(() => {
    if (statusRef.current !== "recording") return
    cancelled.current = false
    clearTick()
    applyStatus("sending")
    recorderRef.current?.stop()
  }, [applyStatus, clearTick])

  const start = useCallback(async () => {
    if (statusRef.current === "recording" || statusRef.current === "sending") return
    // O aviso de permissão pode levar segundos: outro toque não pode abrir um segundo microfone.
    if (starting.current) return
    starting.current = true
    if (noticeTimer.current) clearTimeout(noticeTimer.current)

    const recordedFor = latest.current.chatId

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const context = new Ctor()
      contextRef.current = context
      // O Safari entrega o contexto suspenso quando ele nasce depois de um `await`.
      if (context.state === "suspended") await context.resume()

      const node = context.createAnalyser()
      node.fftSize = 512
      node.smoothingTimeConstant = 0.75
      context.createMediaStreamSource(stream).connect(node)

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunks.current = []
      cancelled.current = false

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      recorder.onstop = () => {
        void finalize(recordedFor, recorder.mimeType || mimeType || "audio/webm")
      }
      recorder.start()

      startedAt.current = performance.now()
      setElapsed(0)
      setAnalyser(node)
      applyStatus("recording")

      clearTick()
      // A cada 250 ms para o segundo virar na hora certa; o mesmo valor não desenha nada.
      tick.current = setInterval(() => {
        const seconds = Math.floor((performance.now() - startedAt.current) / 1000)
        setElapsed(seconds)
        if (seconds >= MAX_SECONDS) stopAndSend()
      }, 250)
    } catch (error) {
      const name = (error as { name?: string } | null)?.name
      const denied =
        name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError"
      releaseDevices()
      applyStatus(denied ? "denied" : "error")
      scheduleNoticeDismiss()
    } finally {
      starting.current = false
    }
  }, [applyStatus, clearTick, finalize, releaseDevices, scheduleNoticeDismiss, stopAndSend])

  const cancel = useCallback(() => {
    if (statusRef.current !== "recording") return
    // Antes do `stop`: é o `onstop` quem decide entre enviar e descartar.
    cancelled.current = true
    clearTick()
    applyStatus("idle")
    recorderRef.current?.stop()
  }, [applyStatus, clearTick])

  const dismissNotice = useCallback(() => {
    if (statusRef.current === "denied" || statusRef.current === "error") applyStatus("idle")
  }, [applyStatus])

  // Trocar de conversa no meio descarta: áudio nenhum pode cair na conversa errada.
  useEffect(() => {
    if (statusRef.current !== "recording") return
    cancelled.current = true
    clearTick()
    applyStatus("idle")
    recorderRef.current?.stop()
  }, [applyStatus, chatId, clearTick])

  useEffect(
    () => () => {
      cancelled.current = true
      if (tick.current) clearInterval(tick.current)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (contextRef.current && contextRef.current.state !== "closed") {
        void contextRef.current.close().catch(() => {})
      }
    },
    []
  )

  return {
    status,
    isRecording: status === "recording",
    /** Gravando ou enviando: enquanto for verdade, a gravação manda na linha do composer. */
    isBusy: status === "recording" || status === "sending",
    elapsed,
    analyser,
    start,
    stopAndSend,
    cancel,
    dismissNotice,
  }
}
