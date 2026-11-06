import { useMatchMedia } from "@/lib/match-media"

/**
 * "É dedo, não mouse." Separado dos cortes de layout de propósito: layout usa
 * `useMobileShell`; interação (Enter envia?, prévia ao passar o mouse, tamanho do alvo)
 * usa este. Um iPad Pro é largo e tem toque; uma janela estreita no desktop tem mouse.
 */
export function useTouchDevice(): boolean {
  return useMatchMedia("(hover: none) and (pointer: coarse)")
}
