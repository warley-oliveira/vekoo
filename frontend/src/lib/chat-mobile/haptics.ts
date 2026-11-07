/** Um toque curto no aparelho, para o gesto que pegou. O iOS não oferece: lá, nada acontece. */
export function haptic(duration = 10): void {
  try {
    navigator.vibrate?.(duration)
  } catch {
    // Vibrar nunca é motivo para atrapalhar o gesto.
  }
}

/**
 * Quem segura ainda está com o dedo na tela quando a folha abre ou a linha vira checkbox. O clique que
 * o navegador gera ao soltar cairia no que apareceu debaixo do dedo: fecharia a folha, ou já tocaria
 * em "Responder". Um toque novo é outro gesto, e desarma isto.
 */
export function swallowReleaseClick(): void {
  const stop = () => {
    window.removeEventListener("click", onClick, true)
    window.removeEventListener("pointerdown", stop, true)
  }
  function onClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    stop()
  }
  window.addEventListener("click", onClick, true)
  window.addEventListener("pointerdown", stop, true)
}
