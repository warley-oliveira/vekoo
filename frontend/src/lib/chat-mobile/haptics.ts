/** Um toque curto no aparelho, para o gesto que pegou. O iOS não oferece: lá, nada acontece. */
export function haptic(duration = 10): void {
  try {
    navigator.vibrate?.(duration)
  } catch {
    // Vibrar nunca é motivo para atrapalhar o gesto.
  }
}
