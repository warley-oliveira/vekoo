// O card muda de lugar sem ninguém estar arrastando: outra pessoa moveu, ou foi pelo "Mover para…".
// Em vez de sumir de um lado e surgir do outro, ele viaja até o lugar novo, o que explica a mudança.
//
// Sem `layoutId` em cada card: uma árvore de projeção por card pesaria justamente onde a tela é mais
// cheia, e a lista de cada etapa rola por dentro e cortaria a viagem. Aqui uma cópia viaja por cima
// de tudo, e o custo é só de quem se moveu.

const DURATION_MS = 260
const EASING = "cubic-bezier(0.2, 0, 0, 1)"

function cardNode(cardId: string) {
  return document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`)
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function isOnScreen(rect: DOMRect) {
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  )
}

/**
 * Guarda onde o card está agora. Chame antes de mudar o cache e rode o retorno depois: ele espera
 * o React desenhar o lugar novo e anima o caminho entre os dois.
 */
export function captureCardPosition(cardId: string): () => void {
  if (prefersReducedMotion()) return () => {}
  const source = cardNode(cardId)
  if (!source) return () => {}

  const before = source.getBoundingClientRect()
  if (!isOnScreen(before)) return () => {}
  const copy = source.cloneNode(true) as HTMLElement

  return () => {
    // Dois quadros: o primeiro é o do `setState` do SWR, o segundo já tem o lugar novo medido.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = cardNode(cardId)
        if (!target) return
        const after = target.getBoundingClientRect()
        const x = after.left - before.left
        const y = after.top - before.top
        if (!isOnScreen(after) || (Math.abs(x) < 1 && Math.abs(y) < 1)) return

        Object.assign(copy.style, {
          position: "fixed",
          left: `${before.left}px`,
          top: `${before.top}px`,
          width: `${before.width}px`,
          height: `${before.height}px`,
          margin: "0",
          zIndex: "40",
          pointerEvents: "none",
        })
        copy.setAttribute("aria-hidden", "true")
        copy.removeAttribute("data-card-id")
        document.body.appendChild(copy)
        target.style.visibility = "hidden"

        copy
          .animate(
            [{ transform: "translate(0, 0)" }, { transform: `translate(${x}px, ${y}px)` }],
            { duration: DURATION_MS, easing: EASING }
          )
          .finished.catch(() => {})
          .finally(() => {
            copy.remove()
            target.style.visibility = ""
          })
      })
    )
  }
}
