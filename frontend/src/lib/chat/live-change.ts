// "Isto acabou de acontecer?" para a lista de conversas. Só o que chega pelo socket (ou por uma
// ação da própria pessoa, que passa pelo mesmo store) abre a janela: a reordenação dentro dela é
// animada. Trocar de aba, filtrar, buscar ou carregar a lista ficam de fora, e a lista só troca.
//
// Uma marca de tempo, e não um estado React: quem lê é a renderização que o próprio evento causou,
// no mesmo instante, e nada precisa se desenhar de novo quando a janela fecha.

const WINDOW_MS = 700

let liveUntil = 0

export function markLiveChange(): void {
  liveUntil = performance.now() + WINDOW_MS
}

export function isLiveChange(): boolean {
  return performance.now() < liveUntil
}
