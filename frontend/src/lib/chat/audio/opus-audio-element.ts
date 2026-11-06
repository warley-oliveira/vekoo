import { decodeOggOpus, fetchAudioBytes } from "./decode-ogg-opus"
import { getCachedBuffer, setCachedBuffer } from "./opus-buffer-cache"
import { acquireAudioContext } from "./shared-audio-context"

export type OpusPlayerStatus = "idle" | "loading" | "ready" | "error"

export type OpusAudioElementOptions = {
  /** Duração conhecida, para o rótulo e o arraste funcionarem antes do primeiro toque. */
  durationHint?: number
  /** Chamado quando o PCM fica pronto: o mesmo decode alimenta a onda. */
  onDecoded?: (buffer: AudioBuffer) => void
}

/**
 * Um player de Opus sobre a Web Audio, com a superfície de um `HTMLAudioElement`. Existe porque o
 * Safari não decodifica Opus e o back-end serve Ogg/Opus. Ser um `EventTarget` com `currentTime`,
 * `playbackRate`, `paused` e `play()` é o que permite ao player tratar este objeto e o `<audio>`
 * com o mesmo código.
 */
export class OpusAudioElement extends EventTarget {
  readonly mediaId: string

  private url: string
  private onDecoded?: (buffer: AudioBuffer) => void

  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private context: AudioContext | null = null

  private playing = false
  private rate = 1
  private hintedDuration = 0

  /** Posição no buffer (s) em que o nó atual começou. */
  private offset = 0
  /** `context.currentTime` no instante em que o nó atual começou. */
  private startedAt = 0

  /** Invalida o `onended` de nós que nós mesmos matamos. */
  private sourceToken = 0
  /** Invalida um `play()` cujo carregamento foi cancelado por um `pause()`. */
  private playToken = 0

  private frame: number | null = null
  private lastTick = 0
  private abort: AbortController | null = null
  private loading: Promise<AudioBuffer> | null = null
  private currentStatus: OpusPlayerStatus = "idle"
  private disposed = false

  constructor(url: string, mediaId: string, options: OpusAudioElementOptions = {}) {
    super()
    this.url = url
    this.mediaId = mediaId
    this.hintedDuration = options.durationHint ?? 0
    this.onDecoded = options.onDecoded
  }

  get status(): OpusPlayerStatus {
    return this.currentStatus
  }

  get paused(): boolean {
    return !this.playing
  }

  get duration(): number {
    return this.buffer?.duration ?? this.hintedDuration
  }

  /** Duração vinda do cache, antes de existir PCM. Sem ela o arraste fica travado até o toque. */
  applyDurationHint(seconds: number): void {
    if (this.buffer || !(seconds > 0) || this.hintedDuration === seconds) return
    this.hintedDuration = seconds
    this.dispatchEvent(new Event("durationchange"))
  }

  get currentTime(): number {
    if (!this.playing || !this.context) return this.offset
    // A taxa multiplica o tempo do contexto: é assim que o nó consome o buffer.
    const elapsed = (this.context.currentTime - this.startedAt) * this.rate
    return Math.min(this.offset + elapsed, this.duration)
  }

  set currentTime(time: number) {
    const clamped = Math.min(Math.max(time, 0), this.duration || 0)
    if (this.playing) {
      // `AudioBufferSourceNode` é de uso único: ir para outro ponto é matar o nó e criar outro.
      this.stopSource()
      this.startSource(clamped)
    } else {
      this.offset = clamped
    }
    this.dispatchEvent(new Event("timeupdate"))
  }

  get playbackRate(): number {
    return this.rate
  }

  set playbackRate(next: number) {
    // Reancora antes de trocar a taxa, senão o relógio salta ao mudar a velocidade no meio.
    if (this.playing && this.context) {
      this.offset = this.currentTime
      this.startedAt = this.context.currentTime
    }
    this.rate = next
    if (this.source) this.source.playbackRate.value = next
  }

  async play(): Promise<void> {
    // PRIMEIRA linha, síncrona: ainda estamos dentro do gesto. Um `await` antes daqui quebra o áudio
    // no iOS em silêncio, sem erro nem log.
    const context = acquireAudioContext()
    this.context = context

    const token = (this.playToken += 1)

    if (!this.buffer) {
      this.setStatus("loading")
      try {
        this.buffer = await this.load(context)
      } catch (error) {
        if (this.disposed || token !== this.playToken) return
        console.error("[audio] não foi possível decodificar", error)
        this.setStatus("error")
        this.dispatchEvent(new Event("error"))
        return
      }
      // A pessoa pode ter tocado em pausar enquanto baixava.
      if (this.disposed || token !== this.playToken) return

      this.setStatus("ready")
      this.onDecoded?.(this.buffer)
      this.dispatchEvent(new Event("loadedmetadata"))
      this.dispatchEvent(new Event("durationchange"))
    }

    // O `resume()` lá de cima pode não ter terminado. Se o contexto não rodar, é melhor mostrar erro
    // do que fingir: o relógio andaria e ninguém ouviria nada.
    if (context.state !== "running") await context.resume().catch(() => {})
    if (this.disposed || token !== this.playToken) return
    if (context.state !== "running") {
      this.setStatus("error")
      this.dispatchEvent(new Event("error"))
      return
    }

    if (this.currentTime >= this.duration) this.offset = 0
    this.startSource(this.currentTime)
    this.playing = true
    this.startTicker()
    this.dispatchEvent(new Event("play"))
  }

  pause(): void {
    this.playToken += 1 // Cancela um `play()` que ainda esteja carregando.
    if (this.currentStatus === "loading") {
      this.abort?.abort()
      this.abort = null
      this.loading = null
      this.setStatus("idle")
    }
    if (!this.playing) return

    this.offset = this.currentTime // Congela a posição antes de matar o nó.
    this.playing = false
    this.stopSource()
    this.stopTicker()
    this.dispatchEvent(new Event("pause"))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.playToken += 1
    this.abort?.abort()
    this.abort = null
    this.loading = null
    this.stopSource()
    this.stopTicker()
    this.playing = false
    this.buffer = null
  }

  private setStatus(next: OpusPlayerStatus) {
    if (this.currentStatus === next) return
    this.currentStatus = next
    this.dispatchEvent(new Event("statuschange"))
  }

  private load(context: AudioContext): Promise<AudioBuffer> {
    const cached = getCachedBuffer(this.mediaId)
    if (cached) return Promise.resolve(cached)
    if (this.loading) return this.loading

    this.abort = new AbortController()
    this.loading = fetchAudioBytes(this.url, this.abort.signal)
      .then((bytes) => decodeOggOpus(bytes, context))
      .then((buffer) => {
        setCachedBuffer(this.mediaId, buffer)
        return buffer
      })
      .finally(() => {
        this.loading = null
      })

    return this.loading
  }

  private startSource(offset: number) {
    const { context, buffer } = this
    if (!context || !buffer) return

    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = this.rate
    source.connect(context.destination)

    const token = (this.sourceToken += 1)
    source.onended = () => {
      // `stop()` também dispara `onended`: o token separa o fim natural do que nós provocamos.
      if (token !== this.sourceToken) return
      this.playing = false
      this.offset = this.duration
      this.stopTicker()
      this.dispatchEvent(new Event("timeupdate"))
      this.dispatchEvent(new Event("ended"))
    }

    source.start(0, Math.min(offset, this.duration))
    this.source = source
    this.offset = offset
    this.startedAt = context.currentTime
  }

  private stopSource() {
    const source = this.source
    if (!source) return

    this.sourceToken += 1
    this.source = null
    source.onended = null
    try {
      source.stop()
    } catch {
      // Já parado.
    }
    source.disconnect()
  }

  private startTicker() {
    if (this.frame !== null) return

    // Por volta de 10 Hz, como o `<audio>`. A posição não acumula erro: vem sempre de `currentTime`.
    const TICK_MS = 100
    const step = (now: number) => {
      if (now - this.lastTick >= TICK_MS) {
        this.lastTick = now
        this.dispatchEvent(new Event("timeupdate"))
      }
      this.frame = requestAnimationFrame(step)
    }

    this.lastTick = 0
    this.frame = requestAnimationFrame(step)
  }

  private stopTicker() {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }
}
