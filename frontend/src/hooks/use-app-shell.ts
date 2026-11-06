import { useEffect } from "react"
import { create } from "zustand"

// O que a tela montada pede à casca. Em tempo de execução, e não numa flag da rota,
// porque quem sabe é o componente: a mesma rota `/chat` mostra a lista (com cromo) ou
// a conversa (imersiva). O cabeçalho e a barra inferior são irmãos do `Outlet`, não
// ancestrais, por isso o store.

type AppShellState = {
  /**
   * Casca sem cromo no celular: cabeçalho e barra inferior saem, liberando a altura
   * toda. É o modo da conversa aberta. No desktop não muda nada.
   */
  immersive: boolean
  setImmersive: (immersive: boolean) => void
  /**
   * A tela é dona da própria rolagem: o `<main>` para de rolar e entrega a área
   * inteira. Quem liga precisa reservar `--app-bottom-nav-total` no fim do que rola.
   */
  fullBleed: boolean
  setFullBleed: (fullBleed: boolean) => void
}

/**
 * `useAppShell().setImmersive(true)`, ou com seletor:
 * `useAppShell((shell) => shell.immersive)`.
 */
export const useAppShell = create<AppShellState>()((set) => ({
  immersive: false,
  setImmersive: (immersive) => set({ immersive }),
  fullBleed: false,
  setFullBleed: (fullBleed) => set({ fullBleed }),
}))

/** Liga o modo imersivo enquanto `active`, e desliga sozinho ao desmontar. */
export function useImmersive(active: boolean): void {
  useEffect(() => {
    if (!active) return
    useAppShell.setState({ immersive: true })
    return () => useAppShell.setState({ immersive: false })
  }, [active])
}

/** Entrega a área inteira à tela enquanto `active`, e devolve ao desmontar. */
export function useFullBleed(active: boolean): void {
  useEffect(() => {
    if (!active) return
    useAppShell.setState({ fullBleed: true })
    return () => useAppShell.setState({ fullBleed: false })
  }, [active])
}
