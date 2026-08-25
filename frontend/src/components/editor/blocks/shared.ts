import type { CSSProperties } from "react"

import type { BlockAlign, CarouselTheme, InkColor } from "@/lib/doc"

// Utilidades comuns aos renderizadores de bloco. Toda medida é em cqw para a
// mesma arte funcionar do thumbnail da busca ao canvas do editor.

/** Cor de tinta absoluta só quando é o acento do tema; ink herda do card. */
export function inkStyle(
  color: InkColor,
  theme: CarouselTheme
): CSSProperties | undefined {
  return color === "accent" ? { color: theme.accent } : undefined
}

/** "Muted" é a própria tinta com menos presença. */
export function inkClass(color: InkColor): string | undefined {
  return color === "muted" ? "opacity-75" : undefined
}

export const TEXT_ALIGN: Record<BlockAlign, string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right",
}

/**
 * Alinhamento de um bloco que não ocupa a linha inteira (botão, selo). Vale
 * `justify-*` numa linha própria, e não `self-*`: o bloco não é filho direto
 * da coluna do card — vem embrulhado por espaçamento e animação — então
 * alinhar-se ao pai não funcionaria.
 */
export const JUSTIFY_ALIGN: Record<BlockAlign, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
}
