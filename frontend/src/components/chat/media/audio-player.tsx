import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, Loader2, Pause, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDuration } from "@/lib/file-utils"
import {
  canPlayOggOpus,
  guessContainerFromUrl,
  needsOpusFallback,
  sniffContainer,
} from "@/lib/chat/audio/audio-playback-support"
import { OpusAudioElement, type OpusPlayerStatus } from "@/lib/chat/audio/opus-audio-element"
import { createDecodingContext } from "@/lib/chat/audio/shared-audio-context"
import {
  computePeaks,
  fillCapsule,
  readWaveform,
  resamplePeaks,
  withWaveformSlot,
  writeWaveform,
} from "@/lib/chat/audio/waveform"
import { mediaSource } from "@/lib/chat/media"

/** O que o player precisa do `<audio>` e do motor de Opus. Os dois têm a mesma cara. */
type PlayableElement = HTMLAudioElement | OpusAudioElement

/** A resolução guardada no cache, independente de quantas barras cabem. */
const WAVEFORM_SAMPLES = 60

const BAR_WIDTH = 3
const BAR_GAP = 2
const PITCH = BAR_WIDTH + BAR_GAP
const MIN_HEIGHT = BAR_WIDTH
const MAX_HEIGHT = 24
const KNOB_RADIUS = 5

const SPEEDS = [1, 1.5, 2]

/** Quanto esperar, depois do toque, para concluir que o `<audio>` não sabe tocar este arquivo. */
const STALL_TIMEOUT_MS = 1200

const PLACEHOLDER = new Array<number>(WAVEFORM_SAMPLES).fill(0)

/** Só um áudio toca de cada vez, em toda a tela. */
let activePlayer: PlayableElement | null = null

export type AudioPlayerProps = {
  source: string | null | undefined
  mediaId: string
  hintedDuration?: number
}

/**
 * O player de áudio do chat: onda, arraste, velocidade e duração. Decide por arquivo se usa o
 * `<audio>` ou o motor de Opus: o Safari não abre Ogg/Opus. O decoder em WASM só desce se for mesmo
 * preciso, e o `<audio>` nem sabe da existência dele.
 */
export default function AudioPlayer({ source, mediaId, hintedDuration }: AudioPlayerProps) {
  const { t } = useTranslation()
  const url = mediaSource(source)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playPromise = useRef<Promise<void> | null>(null)

  // Por estado, e não `useRef`: os ouvintes precisam se refazer quando o player ativo troca.
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [opusElement, setOpusElement] = useState<OpusAudioElement | null>(null)
  const [opusStatus, setOpusStatus] = useState<OpusPlayerStatus>("idle")
  const [needsFallback, setNeedsFallback] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(hintedDuration ?? 0)
  const [failed, setFailed] = useState(false)
  const [peaks, setPeaks] = useState<number[]>(PLACEHOLDER)

  const player: PlayableElement | null = needsFallback ? opusElement : audioElement
  const status: OpusPlayerStatus = needsFallback ? opusStatus : failed ? "error" : "ready"

  // Os valores mais novos, para o desenho em 60 fps não depender de render nenhum.
  const draw = useRef({ peaks, duration })
  draw.current = { peaks, duration }

  const paint = useCallback((ratio: number) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return

    if (canvas.width !== Math.round(width * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)

    // As cores são do tema, lidas de quem desenha: nada de valor solto aqui.
    const styles = getComputedStyle(canvas)
    const played = styles.getPropertyValue("--player-played")
    const rest = styles.getPropertyValue("--player-rest")

    const barCount = Math.max(1, Math.floor((width + BAR_GAP) / PITCH))
    const bars = resamplePeaks(draw.current.peaks, barCount)
    const pitch = (width + BAR_GAP) / barCount
    const barWidth = pitch - BAR_GAP
    const highest = Math.max(...bars) || 1
    const progress = Math.min(Math.max(ratio, 0), 1) * width

    bars.forEach((amplitude, index) => {
      const barHeight = Math.max((amplitude / highest) * MAX_HEIGHT, MIN_HEIGHT)
      const x = index * pitch
      const y = (height - barHeight) / 2
      const fullyPlayed = x + barWidth <= progress

      context.fillStyle = fullyPlayed ? played : rest
      fillCapsule(context, x, y, barWidth, barHeight, barWidth / 2)

      // A barra sob o marcador é pintada só até o pixel exato do progresso.
      if (!fullyPlayed && x < progress) {
        context.save()
        context.beginPath()
        context.rect(x, 0, progress - x, height)
        context.clip()
        context.fillStyle = played
        fillCapsule(context, x, y, barWidth, barHeight, barWidth / 2)
        context.restore()
      }
    })

    const knobX = Math.min(Math.max(progress, KNOB_RADIUS), width - KNOB_RADIUS)
    context.beginPath()
    context.arc(knobX, height / 2, KNOB_RADIUS, 0, 2 * Math.PI)
    context.fillStyle = played
    context.fill()
  }, [])

  const repaint = useCallback(() => {
    const { duration: total } = draw.current
    paint(total ? (player?.currentTime ?? 0) / total : 0)
  }, [paint, player])

  /* ---------- o motor de Opus: inerte até o primeiro play ---------- */

  useEffect(() => {
    if (!url) return

    const element = new OpusAudioElement(url, mediaId, {
      durationHint: hintedDuration,
      onDecoded: (buffer) => {
        // No iOS, `decodeAudioData` recusa Opus: esta é a única chance de ter picos reais.
        const data = computePeaks(buffer.getChannelData(0), WAVEFORM_SAMPLES)
        setPeaks(data)
        setDuration(buffer.duration)
        void writeWaveform({ id: mediaId, data, format: "ogg", duration: buffer.duration })
      },
    })
    const onStatus = () => setOpusStatus(element.status)

    element.addEventListener("statuschange", onStatus)
    setOpusElement(element)
    setOpusStatus(element.status)

    return () => {
      element.removeEventListener("statuschange", onStatus)
      // Obrigatório: o `<audio>` o React desmonta sozinho; um nó de áudio continua tocando.
      element.dispose()
      if (activePlayer === element) activePlayer = null
      setOpusElement(null)
    }
    // `hintedDuration` é só apoio: recriar o motor por causa dele derrubaria o que está tocando.
  }, [url, mediaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (opusElement && duration) opusElement.applyDurationHint(duration)
  }, [duration, opusElement])

  /* ---------- a onda: do cache, ou baixando o arquivo ---------- */

  useEffect(() => {
    if (!url) return
    let cancelled = false

    void (async () => {
      const cached = await readWaveform(mediaId)
      if (cancelled) return

      if (cached?.data.length) {
        setPeaks(cached.data)
        if (cached.duration) setDuration(cached.duration)
        if (needsOpusFallback(cached.format)) setNeedsFallback(true)
        return
      }

      if (needsOpusFallback(guessContainerFromUrl(url))) setNeedsFallback(true)

      await withWaveformSlot(async () => {
        if (cancelled) return
        try {
          const raw = await (await fetch(url)).arrayBuffer()
          if (cancelled) return

          const container = sniffContainer(new Uint8Array(raw, 0, Math.min(16, raw.byteLength)))
          if (needsOpusFallback(container)) setNeedsFallback(true)

          // `decodeAudioData` neutraliza o buffer que recebe: passa uma cópia.
          const audio = await createDecodingContext().decodeAudioData(raw.slice(0))
          if (cancelled) return

          const data = computePeaks(audio.getChannelData(0), WAVEFORM_SAMPLES)
          setPeaks(data)
          setDuration((current) => current || audio.duration)
          void writeWaveform({ id: mediaId, data, format: container, duration: audio.duration })
        } catch {
          // Safari e Opus: os picos reais chegam no primeiro toque, com o decoder.
        }
      })
    })()

    return () => {
      cancelled = true
    }
  }, [mediaId, url])

  /* ---------- o player ativo ---------- */

  useEffect(() => {
    if (!player) return

    const onMetadata = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) setDuration(player.duration)
    }
    const onTime = () => {
      if (!scrubbing.current) setCurrentTime(player.currentTime)
    }
    const onPlay = () => setPlaying(true)
    const onStop = () => setPlaying(false)

    player.addEventListener("loadedmetadata", onMetadata)
    player.addEventListener("durationchange", onMetadata)
    player.addEventListener("timeupdate", onTime)
    player.addEventListener("play", onPlay)
    player.addEventListener("pause", onStop)
    player.addEventListener("ended", onStop)

    return () => {
      player.removeEventListener("loadedmetadata", onMetadata)
      player.removeEventListener("durationchange", onMetadata)
      player.removeEventListener("timeupdate", onTime)
      player.removeEventListener("play", onPlay)
      player.removeEventListener("pause", onStop)
      player.removeEventListener("ended", onStop)
    }
  }, [player])

  // `timeupdate` é aviso, não animação: vem a cada 250 a 500 ms. O marcador lê a posição a cada
  // quadro enquanto toca, sem tocar no estado do React.
  useEffect(() => {
    if (!player || !playing) return

    let frame = requestAnimationFrame(function step() {
      if (!scrubbing.current) repaint()
      frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [player, playing, repaint])

  useEffect(() => {
    repaint()
  }, [peaks, duration, repaint])

  // A bolha muda de largura ao abrir o painel lateral: a onda redesenha na geometria nova.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => repaint())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [repaint])

  /* ---------- quando o `<audio>` não abre o arquivo ---------- */

  const clearStall = useCallback(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current)
    stallTimer.current = null
  }, [])

  useEffect(() => {
    if (!audioElement) return

    const onError = () => {
      clearStall()
      if (audioElement.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        if (canPlayOggOpus()) setFailed(true)
        else setNeedsFallback(true)
      } else if (audioElement.getAttribute("src")) {
        setFailed(true)
      }
    }

    audioElement.addEventListener("error", onError)
    audioElement.addEventListener("playing", clearStall)
    audioElement.addEventListener("loadedmetadata", clearStall)
    audioElement.addEventListener("timeupdate", clearStall)

    return () => {
      clearStall()
      audioElement.removeEventListener("error", onError)
      audioElement.removeEventListener("playing", clearStall)
      audioElement.removeEventListener("loadedmetadata", clearStall)
      audioElement.removeEventListener("timeupdate", clearStall)
    }
  }, [audioElement, clearStall])

  // Solta o `<audio>` quando o motor assume, para não baixar o arquivo duas vezes.
  useEffect(() => {
    if (!needsFallback || !audioElement) return
    audioElement.pause()
    audioElement.removeAttribute("src")
    audioElement.load()
  }, [audioElement, needsFallback])

  useEffect(
    () => () => {
      if (activePlayer && activePlayer === audioElement) activePlayer = null
    },
    [audioElement]
  )

  /**
   * O iOS às vezes nem dispara `error` para um container que não sabe abrir: fica calado. O guarda
   * só arma dentro do toque, porque com `preload="metadata"` o Safari não carrega nada antes dele.
   */
  const armStallGuard = () => {
    if (needsFallback || canPlayOggOpus()) return
    clearStall()
    stallTimer.current = setTimeout(() => {
      if (!audioElement) return
      const unsupported =
        audioElement.networkState === HTMLMediaElement.NETWORK_NO_SOURCE ||
        (audioElement.readyState === 0 && audioElement.paused && audioElement.currentTime === 0)
      if (unsupported) setNeedsFallback(true)
    }, STALL_TIMEOUT_MS)
  }

  /* ---------- controles ---------- */

  const toggle = () => {
    if (!player) return

    if (player.paused) {
      if (activePlayer && activePlayer !== player) activePlayer.pause()
      activePlayer = player
      setFailed(false)
      armStallGuard()

      // Síncrono até aqui: `play()` ainda está dentro do gesto.
      const started = player.play()
      playPromise.current = started
      void started
        .catch(() => {
          // Pausa rápida ou política de reprodução: não é fatal, os eventos dizem o estado real.
        })
        .finally(() => {
          if (playPromise.current === started) playPromise.current = null
        })
    } else {
      const pending = playPromise.current
      // Esperar o `play()` pendente evita o "toca 100 ms e para" dos toques rápidos.
      if (pending) void pending.then(() => player.pause()).catch(() => {})
      else player.pause()
      if (activePlayer === player) activePlayer = null
    }
  }

  const ratioAt = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const scrubTo = (clientX: number) => {
    const ratio = ratioAt(clientX)
    setCurrentTime(ratio * duration)
    paint(ratio)
  }

  const seek = (seconds: number) => {
    const next = Math.min(Math.max(seconds, 0), duration)
    if (player) player.currentTime = next
    setCurrentTime(next)
    paint(duration ? next / duration : 0)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    scrubbing.current = true
    scrubTo(event.clientX)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) scrubTo(event.clientX)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    seek(ratioAt(event.clientX) * duration)
  }

  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (player) player.playbackRate = next
  }

  const loading = status === "loading"
  const errored = status === "error"
  const playLabel = loading
    ? t("chat.audio.loading")
    : errored
      ? t("chat.audio.failed")
      : playing
        ? t("chat.audio.pause")
        : t("chat.audio.play")

  return (
    <div className="flex w-72 max-w-full items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={playLabel}
              disabled={loading || !url}
              onClick={toggle}
              className="shrink-0 rounded-full pointer-coarse:size-10"
            />
          }
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : errored ? (
            <AlertCircle className="text-status-danger" />
          ) : playing ? (
            <Pause className="fill-current" />
          ) : (
            <Play className="fill-current" />
          )}
        </TooltipTrigger>
        <TooltipContent>{playLabel}</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div
          ref={surfaceRef}
          role="slider"
          tabIndex={duration ? 0 : -1}
          aria-label={t("chat.audio.position")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={formatDuration(currentTime)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") seek(currentTime + 5)
            if (event.key === "ArrowLeft") seek(currentTime - 5)
          }}
          className="cursor-pointer touch-none rounded outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [--player-played:var(--primary)] [--player-rest:var(--muted-foreground)]"
        >
          <canvas ref={canvasRef} className="block h-7 w-full opacity-90" aria-hidden />
        </div>
        <span className="text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
          {playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-label={t("chat.audio.speed", { speed })}
        onClick={changeSpeed}
        className="h-6 shrink-0 rounded-full px-1.5 text-[0.6875rem] tabular-nums pointer-coarse:h-9"
      >
        {speed}x
      </Button>

      {/* Sem `src` quando o motor de Opus assume. */}
      <audio
        ref={setAudioElement}
        src={needsFallback || !url ? undefined : url}
        preload="metadata"
        playsInline
        className="hidden"
      />
    </div>
  )
}
