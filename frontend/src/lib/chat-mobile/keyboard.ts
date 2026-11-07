import { useSyncExternalStore } from "react"

// A altura do teclado virtual, como o aparelho dá para saber.
//
// `--kb-inset` só vale no iOS, onde o teclado cobre a tela. No Android, com
// `interactive-widget=resizes-content`, a tela encolhe de verdade: nada fica coberto e a conta da
// casca dá zero. O que funciona nos dois é comparar a altura visível com a maior que já se viu nessa
// orientação. Fora do que se vê, guarda a última altura: é o tamanho do painel de emoji, para a troca
// entre os dois não mexer na conversa.

/** Encolher menos que isso é a barra do navegador, não o teclado. */
const THRESHOLD = 120
const FALLBACK_HEIGHT = 280

type Orientation = "portrait" | "landscape"

const tallest: Record<Orientation, number> = { portrait: 0, landscape: 0 }
const lastHeight: Record<Orientation, number> = { portrait: 0, landscape: 0 }

let open = false
const listeners = new Set<() => void>()

function orientation(): Orientation {
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait"
}

function measure() {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const key = orientation()
  if (height > tallest[key]) tallest[key] = height

  const covered = tallest[key] - height
  const next = covered > THRESHOLD
  if (next) lastHeight[key] = covered

  if (next !== open) {
    open = next
    listeners.forEach((listener) => listener())
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.visualViewport?.addEventListener("resize", measure, { passive: true })
    window.addEventListener("resize", measure, { passive: true })
    measure()
  }
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.visualViewport?.removeEventListener("resize", measure)
    window.removeEventListener("resize", measure)
  }
}

/** Se o teclado está aberto. Só muda ao abrir e fechar: digitar não desenha nada. */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open)
}

/** A altura para quem vai ocupar o lugar do teclado. */
export function rememberedKeyboardHeight(): number {
  return lastHeight[orientation()] || FALLBACK_HEIGHT
}
