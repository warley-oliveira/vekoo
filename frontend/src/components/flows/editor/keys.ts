/** O tempo de uma animação do quadro: zero para quem pediu menos movimento. */
export function motionMs(ms: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
}

export function modKey(): string {
  return isMac() ? "⌘" : "Ctrl"
}

/** Dentro de um campo, a tecla é do campo: Backspace apaga letra, Ctrl+Z desfaz o texto. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor, [role=listbox], [role=menu], [role=combobox]")
  )
}
