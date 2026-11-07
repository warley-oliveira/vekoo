import { useCallback, useSyncExternalStore } from "react"

export type VisualViewportMetrics = {
  /** `visualViewport.height`: a única "altura visível" confiável. */
  height: number
  /** `documentElement.clientHeight`: contra o que o `100vh` do CSS resolve. */
  layoutHeight: number
  /** `visualViewport.offsetTop`, nunca negativo. */
  offsetTop: number
  /** Pixels do viewport de layout cobertos pelo teclado virtual. Zero se ele encolhe a tela. */
  keyboardInset: number
  /** Coberta ou encolhida: é o que diz se a barra inferior sai de cena. */
  isKeyboardOpen: boolean
}

/** Encolher menos que isso é cromo do navegador (barra de URL), não teclado. */
const KEYBOARD_THRESHOLD = 120
/** Um quadro errado durante a inércia do iOS não pode derrubar o layout. */
const MAX_KEYBOARD_RATIO = 0.6
const EPSILON = 1

const INITIAL_METRICS: VisualViewportMetrics = {
  height: 0,
  layoutHeight: 0,
  offsetTop: 0,
  keyboardInset: 0,
  isKeyboardOpen: false,
}

const EDITABLE_SELECTOR =
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="file"]), textarea, [contenteditable="true"]'

type Orientation = "portrait" | "landscape"

/** A maior altura visível já vista: o tamanho da tela sem o teclado, em cada orientação. */
const tallest: Record<Orientation, number> = { portrait: 0, landscape: 0 }

// Pela tela, e não pela janela: em celular baixo, o teclado aberto deixa a janela mais larga do que
// alta, e a orientação pareceria ter mudado.
function currentOrientation(): Orientation {
  const type = window.screen?.orientation?.type
  if (type) return type.startsWith("landscape") ? "landscape" : "portrait"
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait"
}

/**
 * No Android, com `interactive-widget=resizes-content`, o teclado encolhe a tela de verdade: nada fica
 * coberto, e a conta do `keyboardInset` dá zero. O que funciona nos dois sistemas é comparar a altura
 * visível com a maior já vista. Só com dedo e com um campo em foco: encolher a janela no computador,
 * ou dividir a tela no aparelho, também reduz a altura, e não é teclado.
 */
function hasShrunkForKeyboard(height: number): boolean {
  const orientation = currentOrientation()
  if (height > tallest[orientation]) tallest[orientation] = height
  if (tallest[orientation] - height <= KEYBOARD_THRESHOLD) return false
  if (!window.matchMedia("(pointer: coarse)").matches) return false
  return Boolean(document.activeElement?.matches(EDITABLE_SELECTOR))
}

// Store no módulo: um conjunto de ouvintes e um rAF para o app inteiro, não importa
// quantos componentes assinem.

let metrics = INITIAL_METRICS
let listeners: Array<() => void> = []
let frame = 0
let cssWriterCount = 0
let cssVarsSeeded = false

function readMetrics(): VisualViewportMetrics {
  const viewport = window.visualViewport
  const layoutHeight = document.documentElement.clientHeight
  const height = viewport ? viewport.height : window.innerHeight
  const offsetTop = viewport ? Math.max(0, viewport.offsetTop) : 0

  // `clientHeight`, não `innerHeight`: no Safari do iOS, `innerHeight` inclui a faixa
  // atrás da barra de URL recolhida e não muda com o teclado. `- offsetTop` porque o
  // iOS sobe o viewport de layout em vez de redimensioná-lo quando o cursor fica baixo.
  const raw = layoutHeight - height - offsetTop
  const keyboardInset =
    raw > KEYBOARD_THRESHOLD ? Math.min(raw, layoutHeight * MAX_KEYBOARD_RATIO) : 0

  return {
    height,
    layoutHeight,
    offsetTop,
    keyboardInset,
    isKeyboardOpen: hasShrunkForKeyboard(height) || keyboardInset > 0,
  }
}

function hasChanged(next: VisualViewportMetrics, previous: VisualViewportMetrics) {
  return (
    Math.abs(next.height - previous.height) > EPSILON ||
    Math.abs(next.layoutHeight - previous.layoutHeight) > EPSILON ||
    Math.abs(next.offsetTop - previous.offsetTop) > EPSILON ||
    Math.abs(next.keyboardInset - previous.keyboardInset) > EPSILON ||
    next.isKeyboardOpen !== previous.isKeyboardOpen
  )
}

function writeCssVars(next: VisualViewportMetrics) {
  const root = document.documentElement
  root.style.setProperty("--app-vh", `${next.height}px`)
  root.style.setProperty("--app-vv-top", `${next.offsetTop}px`)
  root.style.setProperty("--kb-inset", `${next.keyboardInset}px`)
  root.dataset.keyboard = next.isKeyboardOpen ? "open" : "closed"
}

function measure() {
  frame = 0

  const next = readMetrics()
  const shouldWrite = cssWriterCount > 0
  const changed = hasChanged(next, metrics)

  // Semeia uma vez mesmo sem mudança: senão o primeiro quadro fica sem `--app-vh`.
  if (shouldWrite && (changed || !cssVarsSeeded)) {
    writeCssVars(next)
    cssVarsSeeded = true
  }

  if (!changed) return

  metrics = next
  listeners.forEach((listener) => listener())
}

/**
 * O iOS dispara `scroll` do viewport a ~60 Hz durante a inércia. Tudo vira um quadro
 * só, e `measure` aplica a folga de 1 px para só avisar quando algo de fato mudou.
 */
function schedule() {
  if (frame) return
  frame = requestAnimationFrame(measure)
}

function subscribe(listener: () => void) {
  const isFirst = listeners.length === 0
  listeners.push(listener)

  if (isFirst) {
    const viewport = window.visualViewport
    // `resize` E `scroll`: a sequência do teclado no iOS é `resize` (a altura encolhe)
    // e, um ou dois quadros depois, `scroll` (o offsetTop muda).
    viewport?.addEventListener("resize", schedule, { passive: true })
    viewport?.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule, { passive: true })
    window.addEventListener("orientationchange", schedule, { passive: true })
    measure()
  }

  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
    if (listeners.length > 0) return

    const viewport = window.visualViewport
    viewport?.removeEventListener("resize", schedule)
    viewport?.removeEventListener("scroll", schedule)
    window.removeEventListener("resize", schedule)
    window.removeEventListener("orientationchange", schedule)

    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}

/**
 * Métricas do viewport visível, para quem precisa do número em JS. Quem só precisa de
 * CSS usa as variáveis que `VisualViewportBridge` escreve em `<html>`, sem re-render:
 * `--app-vh`, `--app-vv-top`, `--kb-inset` e `data-keyboard="open|closed"`.
 */
export function useVisualViewport(options?: {
  /** Só `VisualViewportBridge` passa `true`: um único escritor das variáveis. */
  writeCssVars?: boolean
}): VisualViewportMetrics {
  const shouldWriteCssVars = Boolean(options?.writeCssVars)

  const subscribeToStore = useCallback(
    (listener: () => void) => {
      if (shouldWriteCssVars) cssWriterCount += 1
      const unsubscribe = subscribe(listener)

      return () => {
        unsubscribe()
        if (!shouldWriteCssVars) return

        cssWriterCount -= 1
        if (cssWriterCount > 0) return

        cssVarsSeeded = false
        // `--app-vh` fica no último valor, que continua certo; só os sinais de teclado
        // envelhecem quando ninguém mais mede.
        document.documentElement.style.setProperty("--kb-inset", "0px")
        delete document.documentElement.dataset.keyboard
      }
    },
    [shouldWriteCssVars]
  )

  return useSyncExternalStore(subscribeToStore, () => metrics)
}
