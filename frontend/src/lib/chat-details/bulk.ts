import { apiPost } from "@/lib/api"
import { afterBulkAction } from "@/lib/chat/actions"
import { getChat, patchChat } from "@/lib/chat/chat-store"
import type { Chat, ChatStatus } from "@/lib/chat/types"
import type { BulkResult } from "./types"

// O lote das conversas escolhidas na lista: `POST /contacts/bulk-*`, com a mesma regra da tela de
// contatos. Lote não avisa o tempo real, então quem fez acerta o próprio store e pede a conferência
// da lista. Conversa que a pessoa não pode ver simplesmente não conta, e `updatedCount` diz quantas
// mudaram de verdade.

export type BulkChange =
  | { kind: "addTags"; tagIds: string[] }
  | { kind: "removeTags"; tagIds: string[] }
  | { kind: "assign"; accountId: string | null }
  | { kind: "status"; status: ChatStatus }
  | { kind: "automation"; enabled: boolean }

function request(change: BulkChange): { route: string; body: object } {
  switch (change.kind) {
    case "addTags":
      return { route: "bulk-add-tags", body: { tagIds: change.tagIds } }
    case "removeTags":
      return { route: "bulk-remove-tags", body: { tagIds: change.tagIds } }
    case "assign":
      return { route: "bulk-assign-user", body: { accountId: change.accountId } }
    case "status":
      return { route: "bulk-update-status", body: { status: change.status } }
    case "automation":
      return { route: "bulk-toggle-automation", body: { automationEnabled: change.enabled } }
  }
}

function patchFor(change: BulkChange, chat: Chat): Partial<Chat> {
  switch (change.kind) {
    case "addTags":
      return { tagIds: [...new Set([...chat.tagIds, ...change.tagIds])] }
    case "removeTags":
      return { tagIds: chat.tagIds.filter((id) => !change.tagIds.includes(id)) }
    case "assign":
      return { assignedAccountId: change.accountId }
    case "status":
      return { status: change.status }
    case "automation":
      return { automationEnabled: change.enabled, automationResumeAt: null }
  }
}

/**
 * Aplica e reflete. O store é acertado à mão porque a conferência só traz a primeira página: sem
 * isso, uma conversa marcada mais abaixo continuaria mostrando o valor antigo.
 */
export async function applyBulkChange(chatIds: string[], change: BulkChange): Promise<BulkResult> {
  const { route, body } = request(change)
  const result = await apiPost<BulkResult>(`/contacts/${route}`, { chatIds, ...body })

  for (const id of chatIds) {
    const chat = getChat(id)
    if (chat && !chat.partial) patchChat(id, patchFor(change, chat))
  }
  afterBulkAction()

  return result
}
