import { memo, useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

import { fillCapsule } from "@/lib/chat/audio/waveform"

const BAR_WIDTH = 3
const BAR_GAP = 3
const PITCH = BAR_WIDTH + BAR_GAP
const MIN_HEIGHT = BAR_WIDTH
const MAX_HEIGHT = 24

const SAMPLE_MS = 55
const GROW_MS = 200

const GAIN = 3.4
const CURVE = 0.7
const ATTACK = 0.55
const RELEASE = 0.2

type Bar = { level: number; born: number }

/**
 * A onda da gravação, em um `requestAnimationFrame` só: amostra e desenha no mesmo relógio, e a
 * posição é interpolada entre amostras. Com movimento reduzido, as barras não deslizam nem crescem.
 */
export const RecorderWaveform = memo(function RecorderWaveform({
  analyser,
  active,
}: {
  analyser: AnalyserNode | null
  active: boolean
}) {
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedRef = useRef(Boolean(reduced))
  reducedRef.current = Boolean(reduced)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    const size = { width: 0, height: 0 }
    const resize = (width: number, height: number) => {
      if (!width || !height) return
      const pixelRatio = window.devicePixelRatio || 1
      size.width = width
      size.height = height
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) resize(rect.width, rect.height)
    })
    observer.observe(canvas)
    resize(canvas.offsetWidth, canvas.offsetHeight)

    if (!active || !analyser) {
      context.clearRect(0, 0, size.width, size.height)
      return () => observer.disconnect()
    }

    const data = new Uint8Array(analyser.fftSize)
    const bars: Bar[] = []
    let envelope = 0
    let lastSampleAt = performance.now()
    let frame = 0
    const color = getComputedStyle(canvas).color

    const sample = (born: number) => {
      analyser.getByteTimeDomainData(data)

      // RMS, e não a média do valor absoluto: bem menos sensível a estalos.
      let sum = 0
      for (let index = 0; index < data.length; index += 1) {
        const value = (data[index] - 128) / 128
        sum += value * value
      }
      const level = Math.min(1, Math.pow(Math.sqrt(sum / data.length) * GAIN, CURVE))

      // Sobe rápido e desce devagar: é o que dá a sensação orgânica.
      envelope += (level - envelope) * (level > envelope ? ATTACK : RELEASE)
      bars.push({ level: envelope, born })

      const capacity = Math.ceil(size.width / PITCH) + 2
      if (bars.length > capacity) bars.splice(0, bars.length - capacity)
    }

    const draw = (now: number) => {
      const { width, height } = size
      if (!width || !height) return

      context.clearRect(0, 0, width, height)
      context.fillStyle = color

      const still = reducedRef.current
      const progress = still ? 0 : Math.min(1, Math.max(0, (now - lastSampleAt) / SAMPLE_MS))

      bars.forEach((bar, index) => {
        const recency = bars.length - 1 - index
        const x = width - (recency + progress) * PITCH - BAR_WIDTH
        if (x + BAR_WIDTH < 0) return

        const grown = still ? 1 : Math.min(1, Math.max(0, (now - bar.born) / GROW_MS))
        const eased = 1 - Math.pow(1 - grown, 3)
        const target = MIN_HEIGHT + bar.level * (MAX_HEIGHT - MIN_HEIGHT)
        const barHeight = MIN_HEIGHT + (target - MIN_HEIGHT) * eased

        context.globalAlpha = 0.4 + 0.6 * eased
        fillCapsule(context, x, (height - barHeight) / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2)
      })
      context.globalAlpha = 1
    }

    const step = (now: number) => {
      if (now - lastSampleAt > SAMPLE_MS * 10) {
        // Aba em segundo plano: não vale recuperar o atraso barra a barra.
        lastSampleAt = now
        sample(now)
      } else {
        while (now - lastSampleAt >= SAMPLE_MS) {
          lastSampleAt += SAMPLE_MS
          sample(lastSampleAt)
        }
      }
      draw(now)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      context.clearRect(0, 0, size.width, size.height)
    }
  }, [active, analyser])

  return <canvas ref={canvasRef} aria-hidden className="block h-7 min-w-0 flex-1 text-primary" />
})
