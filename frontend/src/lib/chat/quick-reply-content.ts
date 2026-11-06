import type { Attachment } from "@/lib/content/types"

// O que só o composer precisa saber do texto de uma mensagem rápida. As regras do conteúdo em si
// (variáveis, partes, citações) moram em `@/lib/content/quick-reply-content`.
//
// A citação de anexo (`attachment_id_<id>`) é o servidor quem troca pelo arquivo ao enviar. A pessoa
// não deve ler esse código: na caixa de texto ele aparece como uma linha com o clipe e o nome do
// anexo, e volta a ser citação ao enviar. Apagar a linha é tirar o anexo: o que está escrito é o
// que vai.

const REFERENCE = /attachment_id_([\w-]+)/g

const ATTACHMENT_MARK = "📎"

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

/** O marcador de `fillQuickReply`, `{{assim}}`. */
const VARIABLE = /\{\{\s*[^{}]+?\s*\}\}/

/**
 * A primeira variável sem valor na caixa de texto. O servidor não conhece variável de mensagem
 * rápida: o que for assim chega assim ao contato.
 */
export function firstUnfilledVariable(
  text: string
): { marker: string; start: number; end: number } | null {
  const match = VARIABLE.exec(text)
  if (!match) return null
  return { marker: match[0], start: match.index, end: match.index + match[0].length }
}
