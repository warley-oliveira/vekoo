import type { AudioContainer } from "./audio-playback-support"

/** Barra em cápsula. `roundRect` é recente; sem ele, as duas calotas à mão. */
export function fillCapsule(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, r)
  } else {
    context.moveTo(x, y + r)
    context.arc(x + r, y + r, r, Math.PI, 0)
    context.lineTo(x + width, y + height - r)
    context.arc(x + r, y + height - r, r, 0, Math.PI)
    context.closePath()
  }
  context.fill()
}

/** PCM em `count` amplitudes médias: a fonte da onda do player. */
export function computePeaks(channel: Float32Array, count: number): number[] {
  const block = Math.floor(channel.length / count)
  if (block < 1) return new Array<number>(count).fill(0)

  return Array.from({ length: count }, (_, index) => {
    const start = index * block
    let sum = 0
    for (let offset = 0; offset < block; offset += 1) sum += Math.abs(channel[start + offset])
    return sum / block
  })
}

/** O cache guarda 60 amostras; quantas barras aparecem depende da largura desenhada. */
export function resamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === 0 || count < 1) return []
  if (peaks.length === count) return peaks

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * peaks.length) / count)
    const end = Math.max(start + 1, Math.floor(((index + 1) * peaks.length) / count))
    let sum = 0
    for (let position = start; position < end; position += 1) sum += peaks[position]
    return sum / (end - start)
  })
}

/* ---------- cache em IndexedDB ---------- */

const DB_NAME = "vekoo.chat.waveforms"
const STORE_NAME = "waveforms"

export type WaveformRecord = {
  id: string
  data: number[]
  /** O container descoberto: diz, nas visitas seguintes, se este áudio precisa do WASM. */
  format?: AudioContainer
  duration?: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readWaveform(id: string): Promise<WaveformRecord | null> {
  try {
    const db = await openDb()
    return await new Promise<WaveformRecord | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id)
      request.onsuccess = () => resolve((request.result as WaveformRecord) ?? null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    // Safari em navegação privada bloqueia IndexedDB. Sem cache, só recalcula a onda.
    return null
  }
}

export async function writeWaveform(record: WaveformRecord): Promise<void> {
  try {
    const db = await openDb()
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record)
  } catch {
    // Cache é otimização, não requisito.
  }
}

/* ---------- um download de onda por vez ---------- */

const MAX_CONCURRENT = 2
let running = 0
const waiting: (() => void)[] = []

/**
 * Desenhar a onda pede baixar o áudio inteiro. Ao rolar uma conversa cheia de áudio, sem teto, a
 * lista virtual dispararia dezenas de downloads de uma vez.
 */
export async function withWaveformSlot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  running += 1
  try {
    return await run()
  } finally {
    running -= 1
    waiting.shift()?.()
  }
}
