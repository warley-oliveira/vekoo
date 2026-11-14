import type { CSSProperties } from "react"
import { Toaster } from "sonner"

import { useResolvedTheme } from "@/lib/theme"

/*
 * O sonner pinta o aviso com o CSS dele: aqui ele recebe o tema da tela (ícones e botão de
 * fechar) e as superfícies vêm dos tokens, então o aviso é um popover como os outros, nos dois
 * temas.
 */
const TOKENS = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius-lg)",
  // O sonner traz a fonte do sistema; o aviso fala com a voz do app.
  fontFamily: "var(--font-sans)",
} as CSSProperties

export function AppToaster() {
  const theme = useResolvedTheme()

  return (
    <Toaster
      theme={theme}
      style={TOKENS}
      position="bottom-right"
      // Os avisos sobem junto com a barra inferior, em vez de cobri-la.
      offset={{ bottom: "calc(var(--app-bottom-nav-total) + 1rem)" }}
      mobileOffset={{ bottom: "calc(var(--app-bottom-nav-total) + 0.75rem)" }}
    />
  )
}
