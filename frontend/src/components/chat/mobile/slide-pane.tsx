import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { animate, useReducedMotion } from "motion/react"

import { spring, springSoft } from "@/lib/motion"

/** A faixa da borda de onde o gesto de voltar nasce. */
export const EDGE_ZONE_PX = 24
/** Até aqui não dá para saber se é voltar ou rolar. */
const INTENT_PX = 8
/** Soltar além de uma fração da tela, ou rápido assim (px/ms), volta. */
const COMMIT_RATIO = 0.35
const COMMIT_VELOCITY = 0.5
/** Quanto a tela de baixo anda para a esquerda enquanto esta entra: a navegação "empurra". */
const PUSH_RATIO = 0.25

/** Onde a tela de baixo fica quando esta está em `x` (0 aberta, `width` fechada). */
function pushOffset(x: number, width: number): number {
  return -Math.max(width - x, 0) * PUSH_RATIO
}

/** No Safari do iOS o próprio navegador já volta pela borda: dois gestos no mesmo dedo brigam. */
function browserOwnsEdgeSwipe(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return /iPad|iPhone|iPod/.test(nav.userAgent) && !nav.standalone
}

function currentX(element: HTMLElement): number {
  return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
}

type Animation = ReturnType<typeof animate>

export type SlidePaneProps = {
  /** O alvo: está aberto, ou está saindo. O conteúdo some depois que a saída termina. */
  open: boolean
  /** Coberto por quem está por cima: não pinta nem entra na ordem de foco. */
  covered?: boolean
  label: string
  zIndex: number
  /** O gesto só vale para quem está por cima: quem chama diz se é o caso. */
  canSwipe: () => boolean
  /** O gesto foi até o fim. A saída já aconteceu: quem chama só precisa navegar. */
  onBack: () => void
  /** O dedo começou a revelar o que está embaixo, ou desistiu. */
  onPeek?: (peeking: boolean) => void
  /** Terminou de entrar ou de sair. */
  onSettled?: (open: boolean) => void
  /**
   * A tela de baixo, que é empurrada um quarto para a esquerda enquanto esta entra e volta junto
   * quando esta sai, inclusive seguindo o dedo. Como num app nativo: as duas andam juntas.
   */
  under?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * Uma tela por cima da outra, como nos apps nativos: entra pela direita, sai pela direita, e a borda
 * esquerda segue o dedo. Fica presa ao viewport visual (`--app-vh`, `--app-vv-top`), então o teclado
 * nunca cobre o que está nela, no iOS e no Android, sem nada medir nada aqui dentro.
 *
 * A animação de entrada e saída é do Motion em cima de `transform`, que vai para o compositor: o
 * primeiro quadro da conversa pode ser pesado sem o deslize engasgar. Durante o gesto, é o dedo quem
 * escreve o `transform`, direto no elemento, sem passar pelo React.
 */
export function SlidePane({
  open,
  covered = false,
  label,
  zIndex,
  canSwipe,
  onBack,
  onPeek,
  onSettled,
  under,
  children,
}: SlidePaneProps) {
  const reduced = useReducedMotion()
  const pane = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const running = useRef<Animation[]>([])
  const run = useRef(0)
  const wasMounted = useRef(false)

  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  const latest = useRef({ canSwipe, onBack, onPeek, onSettled, reduced })
  useEffect(() => {
    latest.current = { canSwipe, onBack, onPeek, onSettled, reduced }
  })

  const settle = useCallback((isOpen: boolean) => {
    const element = pane.current
    if (isOpen && element) {
      // Em repouso, sem `transform`: com ele, a tela viraria referência de tudo que é `fixed` dentro.
      // No quadro seguinte, porque o fim da animação ainda escreve o valor final.
      const token = run.current
      window.requestAnimationFrame(() => {
        if (token === run.current) element.style.transform = ""
      })
      if (scrim.current) scrim.current.style.opacity = "1"
      // Quem usa leitor de tela precisa ser levado junto para a tela nova. Não sobe teclado: o foco
      // fica no painel, e não num campo.
      if (!element.contains(document.activeElement)) element.focus({ preventScroll: true })
    }
    if (!isOpen) {
      setMounted(false)
      // Em repouso, sem `transform`, pelo mesmo motivo da tela de cima, e no quadro seguinte pelo
      // mesmo motivo também.
      const below = under?.current
      const token = run.current
      if (below) {
        below.style.transform = ""
        window.requestAnimationFrame(() => {
          if (token === run.current) below.style.transform = ""
        })
      }
    }
    latest.current.onSettled?.(isOpen)
  }, [under])

  const slide = useCallback((target: "in" | "out", then: () => void) => {
    const element = pane.current
    const backdrop = scrim.current
    if (!element || !backdrop) return

    const token = (run.current += 1)
    const finish = () => {
      if (token === run.current) then()
    }

    const width = element.offsetWidth
    const from = currentX(element)
    const to = target === "in" ? 0 : width
    const fromOpacity = Number(getComputedStyle(backdrop).opacity)
    const toOpacity = target === "in" ? 1 : 0

    running.current.forEach((animation) => animation.stop())
    running.current = []

    const below = under?.current ?? null

    if (latest.current.reduced) {
      // Sem deslize: a navegação continua, e só o que entra aparece com um fade curto.
      if (below) below.style.transform = ""
      element.style.transform = `translateX(${to}px)`
      backdrop.style.opacity = String(toOpacity)
      if (target === "in") {
        const fade = animate(element, { opacity: [0, 1] }, { duration: 0.15 })
        running.current = [fade]
        void fade.then(finish)
      } else {
        finish()
      }
      return
    }

    if (from === to) {
      backdrop.style.opacity = String(toOpacity)
      finish()
      return
    }

    const transition = target === "in" ? spring : springSoft
    const moving = animate(
      element,
      { transform: [`translateX(${from}px)`, `translateX(${to}px)`] },
      transition
    )
    const fading = animate(backdrop, { opacity: [fromOpacity, toOpacity] }, transition)
    running.current = [moving, fading]
    if (below) {
      running.current.push(
        animate(
          below,
          {
            transform: [
              `translateX(${pushOffset(from, width)}px)`,
              `translateX(${pushOffset(to, width)}px)`,
            ],
          },
          transition
        )
      )
    }
    void moving.then(finish)
  }, [under])

  const firstRun = useRef(true)
  useLayoutEffect(() => {
    const element = pane.current
    const isFirst = firstRun.current
    firstRun.current = false

    if (!element) {
      wasMounted.current = false
      return
    }

    const justMounted = !wasMounted.current
    wasMounted.current = true

    if (open && justMounted && isFirst) {
      // Link direto: a conversa já nasce no lugar, sem deslizar sobre nada.
      settle(true)
      return
    }

    if (open) {
      if (justMounted) element.style.transform = `translateX(${element.offsetWidth}px)`
      if (justMounted && scrim.current) scrim.current.style.opacity = "0"
      slide("in", () => settle(true))
    } else {
      slide("out", () => settle(false))
    }
  }, [open, settle, slide])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return
    if (event.clientX > EDGE_ZONE_PX || !open) return
    if (browserOwnsEdgeSwipe() || !latest.current.canSwipe()) return

    const element = pane.current
    const backdrop = scrim.current
    if (!element || !backdrop) return

    const { pointerId, clientX: startX, clientY: startY } = event
    const width = element.offsetWidth
    let active = false
    let distance = 0
    let lastX = startX
    let lastAt = performance.now()
    let velocity = 0

    const stop = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
    }

    function onMove(move: PointerEvent) {
      if (move.pointerId !== pointerId) return
      const dx = move.clientX - startX
      const dy = move.clientY - startY

      if (!active) {
        if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return
        // Para o lado errado, ou mais vertical que horizontal: é rolagem, e fica com o navegador.
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
          stop()
          return
        }
        active = true
        running.current.forEach((animation) => animation.stop())
        running.current = []
        run.current += 1
        latest.current.onPeek?.(true)
      }

      const now = performance.now()
      if (now > lastAt) velocity = (move.clientX - lastX) / (now - lastAt)
      lastX = move.clientX
      lastAt = now

      distance = Math.max(dx, 0)
      if (latest.current.reduced) return
      ;(element as HTMLDivElement).style.transform = `translateX(${distance}px)`
      ;(backdrop as HTMLDivElement).style.opacity = String(Math.max(1 - distance / width, 0))
      if (under?.current) under.current.style.transform = `translateX(${pushOffset(distance, width)}px)`
    }

    function finish(commit: boolean) {
      if (commit) {
        // Sai primeiro e navega depois: o `open` só vira falso com a tela já fora de vista.
        slide("out", () => latest.current.onBack())
        return
      }
      slide("in", () => {
        settle(true)
        latest.current.onPeek?.(false)
      })
    }

    function onUp(up: PointerEvent) {
      if (up.pointerId !== pointerId) return
      stop()
      if (active) finish(distance > width * COMMIT_RATIO || velocity > COMMIT_VELOCITY)
    }

    function onCancel(cancel: PointerEvent) {
      if (cancel.pointerId !== pointerId) return
      stop()
      if (active) finish(false)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("pointercancel", onCancel, { passive: true })
  }

  if (!mounted) return null

  return (
    <>
      {/* O que fica embaixo apaga um pouco: é o que dá a sensação de uma tela sobre a outra. */}
      <div
        ref={scrim}
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-overlay"
        style={{ zIndex: zIndex - 1 }}
      />
      <section
        ref={pane}
        aria-label={label}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        className="chat-pane fixed inset-x-0 flex min-h-0 flex-col overflow-hidden bg-background pr-safe pl-safe outline-none shadow-[-8px_0_24px_-8px_color-mix(in_oklch,var(--foreground)_14%,transparent)] [overscroll-behavior-x:none]"
        style={{
          top: "var(--app-vv-top, 0px)",
          height: "var(--app-vh, 100dvh)",
          zIndex,
          visibility: covered ? "hidden" : undefined,
        }}
      >
        {children}
      </section>
    </>
  )
}
