import { useVisualViewport } from "@/hooks/use-visual-viewport"
import { useMatchMedia } from "@/lib/match-media"

/** O mesmo corte do `lg` do Tailwind: abaixo de 1024 px, a casca é a do celular. */
const MOBILE_SHELL_QUERY = "(max-width: 1023.98px)"
const COMPACT_PHONE_QUERY = "(max-width: 374px)"

export type MobileShellState = {
  /** Barra inferior e cabeçalho móvel no lugar da barra lateral. */
  isMobileShell: boolean
  /** Celular estreito (< 375 px): sem desfoque, que pesa nos aparelhos mais fracos. */
  isCompactPhone: boolean
  /** O teclado virtual está cobrindo parte da tela. */
  isKeyboardOpen: boolean
}

/** O único portão da casca móvel: decisão de layout, por largura, não por toque. */
export function useMobileShell(): MobileShellState {
  const isMobileShell = useMatchMedia(MOBILE_SHELL_QUERY)
  const isCompactPhone = useMatchMedia(COMPACT_PHONE_QUERY)
  const { isKeyboardOpen } = useVisualViewport()

  return { isMobileShell, isCompactPhone, isKeyboardOpen }
}
