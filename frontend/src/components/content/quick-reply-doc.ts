import type { JSONContent } from "@tiptap/react"
import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model"

import { citeAttachment, tokenizeContent } from "@/lib/content/quick-reply-content"

// O documento do editor e o texto da API, nos dois sentidos. Cada parágrafo é uma linha do
// texto: um Enter é uma quebra, e dois deixam a linha em branco, como em qualquer campo de texto.

export const ATTACHMENT_NODE = "attachmentCitation"
export const VARIABLE_NODE = "messageVariable"

export type AttachmentChipAttrs = {
  id: string
  label: string
  mediaType: string | null
  fileName: string | null
  /** Citação de um anexo que não existe mais. */
  missing: boolean
}

export type VariableChipAttrs = {
  key: string
  label: string
  /** Não é do contato nem de campo nenhum: nada vai preencher. */
  unknown: boolean
}

export type ContentResolvers = {
  attachment: (id: string) => AttachmentChipAttrs
  variable: (key: string) => VariableChipAttrs
}

export function attachmentNode(attrs: AttachmentChipAttrs): JSONContent {
  return { type: ATTACHMENT_NODE, attrs }
}

export function variableNode(attrs: VariableChipAttrs): JSONContent {
  return { type: VARIABLE_NODE, attrs }
}

export function contentToDoc(content: string, resolvers: ContentResolvers): JSONContent {
  return {
    type: "doc",
    content: content
      .replaceAll("\r", "")
      .split("\n")
      .map((line) => {
        const inline = tokenizeContent(line).map((token): JSONContent => {
          switch (token.type) {
            case "text":
              return { type: "text", text: token.text }
            case "attachment":
              return attachmentNode(resolvers.attachment(token.id))
            case "variable":
              return variableNode(resolvers.variable(token.key))
          }
        })
        return inline.length > 0 ? { type: "paragraph", content: inline } : { type: "paragraph" }
      }),
  }
}

// `attachment_id_` termina no primeiro caractere que não é letra, número, "_" ou "-". Um texto
// colado na citação viraria parte do id, e o envio não acharia o anexo: leva um espaço.
const WOULD_EXTEND_CITATION = /^[\w-]/

function inlineToText(parent: ProseMirrorNode | Fragment): string {
  let line = ""
  let afterCitation = false

  const append = (chunk: string) => {
    if (afterCitation && WOULD_EXTEND_CITATION.test(chunk)) line += " "
    line += chunk
  }

  parent.forEach((node) => {
    if (node.isText) {
      append(node.text ?? "")
      afterCitation = false
    } else if (node.type.name === ATTACHMENT_NODE) {
      append(citeAttachment(node.attrs.id as string))
      afterCitation = true
    } else if (node.type.name === VARIABLE_NODE) {
      append(`{{${node.attrs.key as string}}}`)
      afterCitation = false
    }
  })

  return line
}

/** Também serve ao copiar: `content` de um trecho selecionado tem a mesma forma do documento. */
export function docToContent(content: Fragment): string {
  const lines: string[] = []
  let inlineOnly = true

  content.forEach((node) => {
    if (node.isBlock) {
      inlineOnly = false
      lines.push(inlineToText(node))
    }
  })

  return inlineOnly ? inlineToText(content) : lines.join("\n")
}
