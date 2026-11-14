import type { ResolvedTheme } from "@/lib/theme"
import { monaco } from "./monaco-setup"

/*
 * Os temas do Monaco saem dos tokens de `index.css`, e não de uma tabela de hex à parte: o editor
 * é um card como os outros, nos dois temas. O Monaco só entende hex, então cada token passa por um
 * canvas de 1 px. Os dois temas são lidos de uma vez, de um elemento `.theme-light` e outro
 * `.theme-dark` fora da tela, e trocar de tema depois é só trocar o nome.
 */

export const MONACO_THEMES: Record<ResolvedTheme, string> = {
  light: "vekoo-light",
  dark: "vekoo-dark",
}

let defined = false

function toHex(color: string, context: CanvasRenderingContext2D): string {
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = "#000"
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  const channel = (value: number) => value.toString(16).padStart(2, "0")
  return `#${channel(r)}${channel(g)}${channel(b)}${a === 255 ? "" : channel(a)}`
}

function readTokens(theme: ResolvedTheme, context: CanvasRenderingContext2D) {
  const probe = document.createElement("div")
  probe.className = `theme-${theme}`
  probe.hidden = true
  document.body.append(probe)
  const style = getComputedStyle(probe)
  const token = (name: string) => toHex(style.getPropertyValue(name).trim(), context)
  const colors = {
    "editor.background": token("--card"),
    "editor.foreground": token("--foreground"),
    "editorLineNumber.foreground": token("--muted-foreground"),
    "editorLineNumber.activeForeground": token("--foreground"),
    "editor.lineHighlightBackground": token("--muted"),
    "editor.lineHighlightBorder": token("--muted"),
    "editor.selectionBackground": token("--selection"),
    "editor.inactiveSelectionBackground": token("--selection"),
    "editorCursor.foreground": token("--primary"),
    "editorIndentGuide.background1": token("--border"),
    "editorWidget.background": token("--popover"),
    "editorWidget.foreground": token("--popover-foreground"),
    "editorWidget.border": token("--border"),
    "editorSuggestWidget.background": token("--popover"),
    "editorSuggestWidget.border": token("--border"),
    "editorSuggestWidget.selectedBackground": token("--accent"),
    "editorHoverWidget.background": token("--popover"),
    "editorHoverWidget.border": token("--border"),
    "editorGutter.background": token("--card"),
    "minimap.background": token("--card"),
    "scrollbarSlider.background": token("--scrollbar-thumb"),
    "scrollbarSlider.hoverBackground": token("--scrollbar-thumb-hover"),
    "scrollbarSlider.activeBackground": token("--scrollbar-thumb-active"),
    "scrollbar.shadow": "#00000000",
    focusBorder: token("--ring"),
  }
  probe.remove()
  return colors
}

/** Registra `vekoo-light` e `vekoo-dark`. Chame no `beforeMount` do editor. */
export function defineMonacoThemes() {
  if (defined) return
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!context) return
  for (const theme of ["light", "dark"] as const) {
    monaco.editor.defineTheme(MONACO_THEMES[theme], {
      base: theme === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: readTokens(theme, context),
    })
  }
  defined = true
}
