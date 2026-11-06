import type { Attachment } from "./types"

// O conteúdo de uma mensagem rápida pode citar anexo (`attachment_id_<id>`), e é o servidor
// quem troca a citação pelo arquivo ao enviar. A pessoa não deve ler esse código: na caixa de
// texto ele aparece como uma linha com o clipe e o nome do anexo, e volta a ser citação ao
// enviar. Apagar a linha é tirar o anexo: o que está escrito é o que vai.

const REFERENCE = /attachment_id_([\w-]+)/g

export const ATTACHMENT_MARK = "📎"

export type ReplyPiece =
  | { kind: "text"; text: string }
  | { kind: "attachment"; id: string; attachment: Attachment | undefined }

/** Em partes, como o servidor separa: anexo sozinho, e texto quebrado em parágrafos. */
export function splitReplyContent(
  content: string,
  attachments: Map<string, Attachment>
): ReplyPiece[] {
  const pieces: ReplyPiece[] = []
  let cursor = 0

  const pushText = (raw: string) => {
    for (const paragraph of raw.split(/\n{2,}/)) {
      const text = paragraph.replace(/^\n+|\n+$/g, "")
      if (text.trim()) pieces.push({ kind: "text", text })
    }
  }

  for (const match of content.matchAll(REFERENCE)) {
    pushText(content.slice(cursor, match.index))
    pieces.push({ kind: "attachment", id: match[1], attachment: attachments.get(match[1]) })
    cursor = match.index + match[0].length
  }
  pushText(content.slice(cursor))

  return pieces
}

/** Uma linha de apoio no menu: sem o código do anexo, que está na contagem ao lado. */
export function stripReferencesForPreview(content: string): string {
  return content.replace(REFERENCE, "").replace(/\s+/g, " ").trim()
}

export function countAttachments(content: string): number {
  return Array.from(content.matchAll(REFERENCE)).length
}

/** Citação para o que aparece na caixa de texto. Devolve o mapa para fazer o caminho de volta. */
export function referencesToVisual(
  content: string,
  attachments: Map<string, Attachment>,
  fallbackName: string
): { text: string; references: Map<string, string> } {
  const references = new Map<string, string>()

  const text = content.replace(REFERENCE, (_, id: string) => {
    const name = attachments.get(id)?.name ?? fallbackName
    let label = `${ATTACHMENT_MARK} ${name}`
    let copy = 2
    while (references.has(label) && references.get(label) !== id) {
      label = `${ATTACHMENT_MARK} ${name} (${copy})`
      copy += 1
    }
    references.set(label, id)
    return label
  })

  return { text, references }
}

export function visualToReferences(text: string, references: Map<string, string>): string {
  let content = text
  for (const [label, id] of references) {
    content = content.split(label).join(`attachment_id_${id}`)
  }
  return content
}
