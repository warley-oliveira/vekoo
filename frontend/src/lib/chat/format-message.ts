import DOMPurify from "dompurify"
import linkifyHtml from "linkify-html"

/**
 * Texto cru de conversa em HTML seguro: endereço vira link, `*negrito*`, `_itálico_`,
 * `~riscado~` e quebra de linha, como no WhatsApp. O texto é escapado antes de tudo, e o
 * resultado ainda passa pelo DOMPurify: quem escreve é o contato.
 */
export function formatMessage(text: string | null | undefined): string {
  let html = (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

  try {
    html = linkifyHtml(html, {
      target: "_blank",
      rel: "noopener noreferrer",
    })
  } catch {
    // Sem link, mas com o texto: melhor do que perder a mensagem.
  }

  html = html
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<strong>$2</strong>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?:;]|$)/g, "$1<del>$2</del>")
    .replace(/\n/g, "<br>")

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["a", "strong", "em", "del", "br"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  })
}
