// O texto de uma mensagem rápida, sem depender de tela: é daqui que o editor, a prévia e o
// composer do chat tiram as mesmas regras. Módulo sem idioma próprio.
//
// Dois marcadores vivem no texto:
// - `attachment_id_<id>`: o envio troca pelo arquivo (`MessageHandling`, no back).
// - `{{nome}}`: quem troca é o composer, ao inserir a mensagem na conversa (`fillQuickReply`).
//   O back não conhece variável de mensagem rápida: o que chegar nele sai como está.

import { deriveCustomFieldKey } from "./normalization"

const CITATION_SOURCE = "attachment_id_([\\w-]+)"
// O mesmo marcador das campanhas (`Outreach::MessageContent`), para a pessoa aprender um só.
const VARIABLE_SOURCE = "\\{\\{\\s*([^{}]+?)\\s*\\}\\}"

export type ContentToken =
  | { type: "text"; text: string }
  | { type: "attachment"; id: string }
  | { type: "variable"; key: string }

/** Quebra o texto em trechos, citações de anexo e variáveis, na ordem em que aparecem. */
export function tokenizeContent(content: string): ContentToken[] {
  const tokens: ContentToken[] = []
  const pattern = new RegExp(`${CITATION_SOURCE}|${VARIABLE_SOURCE}`, "g")
  let position = 0

  for (const match of content.matchAll(pattern)) {
    if (match.index > position) {
      tokens.push({ type: "text", text: content.slice(position, match.index) })
    }
    tokens.push(
      match[1] !== undefined
        ? { type: "attachment", id: match[1] }
        : { type: "variable", key: match[2] }
    )
    position = match.index + match[0].length
  }
  if (position < content.length) tokens.push({ type: "text", text: content.slice(position) })

  return tokens
}

export function citeAttachment(id: string): string {
  return `attachment_id_${id}`
}

export function citedAttachmentIds(content: string): string[] {
  const ids = tokenizeContent(content).flatMap((token) =>
    token.type === "attachment" ? [token.id] : []
  )
  return [...new Set(ids)]
}

export function usedVariableKeys(content: string): string[] {
  const keys = tokenizeContent(content).flatMap((token) =>
    token.type === "variable" ? [token.key] : []
  )
  return [...new Set(keys)]
}

/** Vale como mensagem: tem texto, ou ao menos um anexo. */
export function hasMeaningfulContent(content: string): boolean {
  return tokenizeContent(content).some(
    (token) => token.type !== "text" || token.text.trim().length > 0
  )
}

/** Quantos caracteres a pessoa escreveu: a citação de um anexo não é texto dela. */
export function visibleLength(content: string): number {
  return tokenizeContent(content).reduce((total, token) => {
    if (token.type === "attachment") return total
    return total + (token.type === "text" ? token.text.length : token.key.length + 4)
  }, 0)
}

/** O atalho como a API grava: `Frete Grátis` vira `frete-gratis` (o `parameterize` do Rails). */
export function slugifyTrigger(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
}

/* ---------- como a mensagem sai ---------- */

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "attachment"; id: string }
  /** Uma parte que é só o link de uma imagem vai como imagem. */
  | { kind: "imageLink"; url: string }

const IMAGE_LINK = /^https?:\/\/\S+\.(?:jpe?g|gif|png|bmp|tiff?|svg|webp)$/i

// A mesma limpeza de `MessageHandling#clean_message!`, no caminho de quem escreve na tela.
function cleanMessage(text: string): string {
  return text
    .replace(/\[(https?:\/\/\S+)\]/g, "$1")
    .replaceAll("![", "[")
    .replaceAll("**", "*")
    .replace(/\[score:.*?\]/g, "")
    .replace(/\[.*?\]\((.*?)\)/g, "$1")
    .replaceAll("\r", "")
}

/**
 * As partes que vão para o canal, na ordem, como `Chats::SendOperatorMessage` as monta: cada
 * anexo é uma mensagem, e só 10 quebras de linha seguidas separam texto de texto. O envio tira
 * colchetes, sinais de maior e menor, crases, aspas e til do texto, e descarta parte repetida:
 * a prévia mostra o mesmo, porque é o que o contato recebe.
 */
export function splitMessageParts(content: string): MessagePart[] {
  const pattern = new RegExp(`${CITATION_SOURCE}|\\n{10,}`, "g")
  const cleaned = cleanMessage(content)
  const parts: MessagePart[] = []
  const seenTexts = new Set<string>()

  const pushText = (raw: string) => {
    const text = raw.trim().replace(/[[\]<>`"'~]/g, "")
    if (!text.trim() || seenTexts.has(text)) return
    seenTexts.add(text)
    parts.push(IMAGE_LINK.test(text) ? { kind: "imageLink", url: text } : { kind: "text", text })
  }

  let position = 0
  for (const match of cleaned.matchAll(pattern)) {
    pushText(cleaned.slice(position, match.index))
    if (match[1] !== undefined) parts.push({ kind: "attachment", id: match[1] })
    position = match.index + match[0].length
  }
  pushText(cleaned.slice(position))

  return parts
}

/* ---------- variáveis ---------- */

/** As que existem em toda conversa. As outras são as chaves dos campos personalizados. */
export const BUILT_IN_VARIABLES = ["nome", "primeiro_nome", "telefone", "atendente"] as const
export type BuiltInVariable = (typeof BUILT_IN_VARIABLES)[number]

export function isBuiltInVariable(key: string): key is BuiltInVariable {
  return (BUILT_IN_VARIABLES as readonly string[]).includes(key)
}

/** O que o composer sabe da conversa aberta. Tudo opcional: o que faltar fica por preencher. */
export type QuickReplyContext = {
  contactName?: string | null
  phone?: string | null
  agentName?: string | null
  /** `chat.customAttributes`. */
  customAttributes?: Record<string, unknown> | null
}

function builtInValue(key: BuiltInVariable, context: QuickReplyContext): string | null {
  switch (key) {
    case "nome":
      return context.contactName || null
    case "primeiro_nome":
      return context.contactName?.trim().split(/\s+/)[0] || null
    case "telefone":
      return context.phone || null
    case "atendente":
      return context.agentName || null
  }
}

/** A chave como está no texto, ou a que ela daria se alguém escreveu `{{Cidade}}` à mão. */
export function canonicalVariableKey(key: string): string {
  return isBuiltInVariable(key) ? key : deriveCustomFieldKey(key) || key
}

export function variableValue(key: string, context: QuickReplyContext): string | null {
  const canonical = canonicalVariableKey(key)
  if (isBuiltInVariable(canonical)) return builtInValue(canonical, context)

  const attributes = context.customAttributes
  const value = attributes?.[key] ?? attributes?.[canonical]
  return typeof value === "string" || typeof value === "number" ? String(value) || null : null
}

/**
 * O texto pronto para o composer: troca as variáveis pelos dados da conversa. O que não tiver
 * valor continua `{{assim}}` no campo de mensagem, à vista de quem vai enviar, e as citações de
 * anexo ficam como estão, porque quem as resolve é o envio.
 */
export function fillQuickReply(content: string, context: QuickReplyContext): string {
  return content.replace(
    new RegExp(VARIABLE_SOURCE, "g"),
    (marker, key: string) => variableValue(key, context) ?? marker
  )
}

/** As mensagens que a pessoa perderia o arquivo se este anexo fosse excluído. */
export function quickRepliesCiting<T extends { content: string }>(
  quickReplies: readonly T[],
  attachmentId: string
): T[] {
  return quickReplies.filter((reply) => citedAttachmentIds(reply.content).includes(attachmentId))
}
