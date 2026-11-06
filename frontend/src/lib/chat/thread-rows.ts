import { isGroupableMedia } from "./message-rules"
import type { OutgoingMessage } from "./thread-store"
import type { ChatMessage } from "./types"

// Do histórico às linhas da lista virtual. Separador de data não é linha: ele viaja como
// cabeçalho da primeira linha do dia, para cada linha continuar correspondendo a mensagens.
// É o que deixa a conta do "quantas linhas entraram no topo" sair certa ao carregar antigas.

/** Notas do histórico que a pessoa vê. As outras eram do modo de depuração da origem. */
const VISIBLE_NOTES = new Set([
  "assigned-user-notation",
  "automation-toggle-notation",
  "automation-stopped",
  "error",
])

/** Mídias do mesmo remetente, com até esse intervalo, viram uma grade. */
const MEDIA_GROUP_WINDOW_MS = 2 * 60 * 1000

/** Mensagens seguidas do mesmo lado, nesse intervalo, encostam e repetem menos informação. */
const BUBBLE_GROUP_WINDOW_MS = 3 * 60 * 1000

export type ThreadRow =
  | {
      kind: "message"
      key: string
      messages: [ChatMessage]
      message: ChatMessage
      day: number | null
      startsGroup: boolean
      endsGroup: boolean
    }
  | {
      kind: "media-group"
      key: string
      messages: ChatMessage[]
      day: number | null
      startsGroup: boolean
      endsGroup: boolean
    }
  | { kind: "note"; key: string; message: ChatMessage; messages: [ChatMessage]; day: number | null }
  | { kind: "ad-greeting"; key: string; message: ChatMessage; messages: [ChatMessage]; day: number | null }
  | { kind: "widget-context"; key: string; message: ChatMessage; messages: [ChatMessage]; day: number | null }
  | { kind: "waiting"; key: string; message: ChatMessage; messages: [ChatMessage]; day: number | null }
  | { kind: "outgoing"; key: string; outgoing: OutgoingMessage; day: null }

function isConversationMessage(message: ChatMessage): boolean {
  if (message.role !== "user" && message.role !== "assistant") return false
  if (message.missingMessage || message.deletedAt) return true
  return (
    Boolean(message.content) ||
    message.typeElement === "audio" ||
    message.typeElement === "media" ||
    message.typeElement === "image"
  )
}

function isVisible(message: ChatMessage): boolean {
  // A original de uma mensagem longa nunca aparece: quem aparece são as partes.
  if (message.hasSpan) return false
  if (message.role === "base" || message.role === "system") {
    return (
      VISIBLE_NOTES.has(message.roleBaseType ?? "") ||
      message.roleBaseType === "waiting-message" ||
      message.roleBaseType === "instagram-ad-greeting" ||
      message.roleBaseType === "widget-context"
    )
  }
  return isConversationMessage(message)
}

function startOfDay(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function sameAuthor(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.role === b.role && a.senderName === b.senderName && a.messageOrigin === b.messageOrigin
  )
}

function sameRow(a: ThreadRow, b: ThreadRow): boolean {
  if (a.kind !== b.kind || a.day !== b.day) return false
  if (a.kind === "outgoing") return a.outgoing === (b as typeof a).outgoing

  const other = b as Exclude<ThreadRow, { kind: "outgoing" }>
  if (a.messages.length !== other.messages.length) return false
  if (a.messages.some((message, index) => message !== other.messages[index])) return false
  if (a.kind === "message" || a.kind === "media-group") {
    const flags = b as typeof a
    return a.startsGroup === flags.startsGroup && a.endsGroup === flags.endsGroup
  }
  return true
}

/**
 * Monta as linhas. `previous` devolve a mesma referência para a linha que não mudou: a linha é
 * memoizada por referência, então uma mensagem nova desenha só a si mesma e a vizinha.
 */
export function buildThreadRows(
  messages: ChatMessage[],
  outbox: OutgoingMessage[],
  previous: ThreadRow[] = []
): ThreadRow[] {
  const visible = messages.filter(isVisible)
  const rows: ThreadRow[] = []

  let lastDay: number | null = null
  const dayHeader = (at: number): number | null => {
    const day = startOfDay(at)
    if (day === lastDay) return null
    lastDay = day
    return day
  }

  for (let index = 0; index < visible.length; index += 1) {
    const message = visible[index]
    const day = dayHeader(message.createdAt)
    const single: [ChatMessage] = [message]

    if (message.role === "base" || message.role === "system") {
      if (message.roleBaseType === "instagram-ad-greeting") {
        rows.push({ kind: "ad-greeting", key: message.id, message, messages: single, day })
      } else if (message.roleBaseType === "widget-context") {
        rows.push({ kind: "widget-context", key: message.id, message, messages: single, day })
      } else if (message.roleBaseType === "waiting-message") {
        rows.push({ kind: "waiting", key: message.id, message, messages: single, day })
      } else {
        rows.push({ kind: "note", key: message.id, message, messages: single, day })
      }
      continue
    }

    if (isGroupableMedia(message)) {
      const group = [message]
      while (index + 1 < visible.length) {
        const next = visible[index + 1]
        const last = group[group.length - 1]
        if (
          !isGroupableMedia(next) ||
          !sameAuthor(next, last) ||
          next.createdAt - last.createdAt > MEDIA_GROUP_WINDOW_MS ||
          startOfDay(next.createdAt) !== startOfDay(last.createdAt)
        ) {
          break
        }
        group.push(next)
        index += 1
      }

      if (group.length > 1) {
        rows.push({
          kind: "media-group",
          key: `group:${message.id}`,
          messages: group,
          day,
          startsGroup: true,
          endsGroup: true,
        })
        continue
      }
    }

    rows.push({
      kind: "message",
      key: message.id,
      message,
      messages: single,
      day,
      startsGroup: true,
      endsGroup: true,
    })
  }

  // Encostar as bolhas vizinhas, numa segunda passada: já se sabe quem é linha de quem.
  for (let index = 1; index < rows.length; index += 1) {
    const before = rows[index - 1]
    const row = rows[index]
    if (
      (before.kind !== "message" && before.kind !== "media-group") ||
      (row.kind !== "message" && row.kind !== "media-group") ||
      row.day !== null
    ) {
      continue
    }

    const last = before.messages[before.messages.length - 1]
    const first = row.messages[0]
    if (sameAuthor(last, first) && first.createdAt - last.createdAt <= BUBBLE_GROUP_WINDOW_MS) {
      before.endsGroup = false
      row.startsGroup = false
    }
  }

  for (const entry of outbox) {
    rows.push({ kind: "outgoing", key: entry.localId, outgoing: entry, day: null })
  }

  if (previous.length === 0) return rows

  const known = new Map(previous.map((row) => [row.key, row]))
  return rows.map((row) => {
    const before = known.get(row.key)
    return before && sameRow(before, row) ? before : row
  })
}

/** Quantas linhas novas entraram antes da que era a primeira: é o que o Virtuoso precisa saber. */
export function rowsPrepended(rows: ThreadRow[], firstMessageId: string | null): number {
  if (!firstMessageId) return 0
  const index = rows.findIndex(
    (row) => row.kind !== "outgoing" && row.messages.some((message) => message.id === firstMessageId)
  )
  return index > 0 ? index : 0
}

export function firstMessageIdOf(rows: ThreadRow[]): string | null {
  const row = rows[0]
  return row && row.kind !== "outgoing" ? row.messages[0].id : null
}
