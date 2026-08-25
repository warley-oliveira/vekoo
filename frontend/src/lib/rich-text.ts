import {
  normalizeSpans,
  type InkColor,
  type TextSpan,
} from "@/lib/doc"

// A ponte entre os trechos do documento e o HTML que o contenteditable
// manipula. O navegador é quem sabe dividir uma seleção no meio de uma
// palavra — deixamos ele fazer isso e traduzimos o resultado de volta.
//
// Vocabulário fixo: <b> <i> <u> <a href> e <span data-ink>. Estilos inline
// (que alguns navegadores insistem em produzir) são lidos na volta, mas nunca
// escritos.

const INK_VALUES: readonly InkColor[] = ["ink", "accent", "muted"]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Trechos → HTML para semear o editor. Quebras viram <br>. */
export function spansToHtml(spans: TextSpan[]): string {
  if (spans.length === 0) return ""
  return spans
    .map((span) => {
      let html = escapeHtml(span.text).replace(/\n/g, "<br>")
      if (span.bold) html = `<b>${html}</b>`
      if (span.italic) html = `<i>${html}</i>`
      if (span.underline) html = `<u>${html}</u>`
      if (span.color) html = `<span data-ink="${span.color}">${html}</span>`
      if (span.href) html = `<a href="${escapeHtml(span.href)}">${html}</a>`
      return html
    })
    .join("")
}

type Marks = Omit<TextSpan, "text">

/** Marcas que este nó acrescenta às herdadas do pai. */
function marksOf(element: Element, inherited: Marks): Marks {
  const tag = element.tagName.toLowerCase()
  const style = element.getAttribute("style") ?? ""
  const next: Marks = { ...inherited }

  if (tag === "b" || tag === "strong" || /font-weight:\s*(bold|[6-9]00)/.test(style)) {
    next.bold = true
  }
  if (tag === "i" || tag === "em" || /font-style:\s*italic/.test(style)) {
    next.italic = true
  }
  if (tag === "u" || /text-decoration[^;]*underline/.test(style)) {
    next.underline = true
  }
  const ink = element.getAttribute("data-ink")
  if (ink && (INK_VALUES as readonly string[]).includes(ink)) {
    next.color = ink as InkColor
  }
  if (tag === "a") {
    const href = element.getAttribute("href")
    if (href) next.href = href
  }
  return next
}

/** HTML → trechos. Só as marcas do vocabulário sobrevivem; o resto é texto. */
export function htmlToSpans(html: string): TextSpan[] {
  const root = document.createElement("div")
  root.innerHTML = html
  const spans: TextSpan[] = []

  const walk = (node: Node, marks: Marks) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ""
        if (text) spans.push({ ...marks, text })
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const element = child as Element
      const tag = element.tagName.toLowerCase()
      if (tag === "br") {
        spans.push({ ...marks, text: "\n" })
        continue
      }
      // Um bloco dentro do editor (div/p que o navegador cria no Enter)
      // vale por uma quebra de linha antes do conteúdo.
      if ((tag === "div" || tag === "p") && spans.length > 0) {
        spans.push({ ...marks, text: "\n" })
      }
      walk(element, marksOf(element, marks))
    }
  }

  walk(root, {})
  return normalizeSpans(spans)
}

/** Alterna uma marca na seleção atual usando o próprio navegador. */
export function toggleInlineMark(mark: "bold" | "italic" | "underline"): void {
  document.execCommand("styleWithCSS", false, "false")
  document.execCommand(mark)
}

/** Estado atual da seleção — o que a barra de formatação mostra aceso. */
export function activeMarks(): Record<"bold" | "italic" | "underline", boolean> {
  const query = (name: string) => {
    try {
      return document.queryCommandState(name)
    } catch {
      return false
    }
  }
  return {
    bold: query("bold"),
    italic: query("italic"),
    underline: query("underline"),
  }
}

/** Envolve a seleção com um elemento — usado por cor de tinta e link. */
function wrapSelection(build: (fragment: DocumentFragment) => Element): boolean {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!selection || !range || range.collapsed) return false

  const wrapper = build(range.extractContents())
  range.insertNode(wrapper)

  const next = document.createRange()
  next.selectNodeContents(wrapper)
  selection.removeAllRanges()
  selection.addRange(next)
  return true
}

/** Pinta a seleção com uma tinta do tema (ou remove a pintura). */
export function applyInk(color: InkColor | null): boolean {
  return wrapSelection((fragment) => {
    const element = document.createElement("span")
    if (color) element.setAttribute("data-ink", color)
    element.appendChild(fragment)
    return element
  })
}

export function applyLink(href: string): boolean {
  return wrapSelection((fragment) => {
    const anchor = document.createElement("a")
    anchor.setAttribute("href", href)
    anchor.appendChild(fragment)
    return anchor
  })
}

/** Tira todas as marcas do trecho selecionado. */
export function clearMarks(): void {
  document.execCommand("styleWithCSS", false, "false")
  document.execCommand("removeFormat")
  applyInk(null)
}

/** Retângulo da seleção — é onde a barra de formatação se ancora. */
export function selectionRect(): DOMRect | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  return rect.width === 0 && rect.height === 0 ? null : rect
}

/** Texto colado sem formatação alheia — só a quebra de linha sobrevive. */
export function insertPlainText(text: string): void {
  document.execCommand("insertText", false, text)
}
