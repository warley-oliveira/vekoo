import { mutate as globalMutate } from "swr"

import { apiDelete, apiPatch, apiPost, apiPut } from "@/lib/api"
import { removeTagFromChat } from "@/lib/chat/actions"
import { getChat, patchChat, publishChat } from "@/lib/chat/chat-store"
import type { Chat, ChatResponse, ChatTag } from "@/lib/chat/types"

// As escritas do painel que `updateChat` não cobre. Todas otimistas, e rejeitam com `ApiError`:
// quem chama dá o retorno à pessoa.

/** Quem lê etiquetas: a lista do chat e os filtros da tela de contatos. */
export function reloadTags(): void {
  void globalMutate(
    (key) => key === "/chat-tags" || (typeof key === "string" && key.startsWith("/contacts/filters"))
  )
}

export async function applyTag(chatId: string, tagId: string): Promise<void> {
  const before = getChat(chatId)?.tagIds ?? []
  if (before.includes(tagId)) return

  patchChat(chatId, { tagIds: [...before, tagId] })
  try {
    const { tagIds } = await apiPut<{ tagIds: string[] }>(`/chat-tags/${tagId}/chats/${chatId}`)
    patchChat(chatId, { tagIds })
  } catch (error) {
    patchChat(chatId, { tagIds: (getChat(chatId)?.tagIds ?? []).filter((id) => id !== tagId) })
    throw error
  }
}

export async function removeTag(chatId: string, tagId: string): Promise<void> {
  const before = getChat(chatId)?.tagIds ?? []
  patchChat(chatId, { tagIds: before.filter((id) => id !== tagId) })
  try {
    await removeTagFromChat(chatId, tagId)
  } catch (error) {
    patchChat(chatId, { tagIds: before })
    throw error
  }
}

export type TagInput = { name: string; color: string; description: string | null }

export async function createTag(input: TagInput): Promise<ChatTag> {
  const { chatTag } = await apiPost<{ chatTag: ChatTag }>("/chat-tags", { chatTag: input })
  reloadTags()
  return chatTag
}

export async function updateTag(tagId: string, input: TagInput): Promise<ChatTag> {
  const { chatTag } = await apiPatch<{ chatTag: ChatTag }>(`/chat-tags/${tagId}`, { chatTag: input })
  reloadTags()
  return chatTag
}

/** Sai de todas as conversas no servidor. As daqui acertam a própria lista, que não recebe aviso. */
export async function deleteTag(tagId: string): Promise<void> {
  await apiDelete(`/chat-tags/${tagId}`)
  reloadTags()
}

/**
 * `PUT /chats/:id/attributes` soma ao que existe, e `null` tira a chave. O que volta é o mapa inteiro:
 * um campo com normalização grava diferente do que foi digitado, e vale o que o servidor gravou.
 */
export async function saveAttribute(
  chatId: string,
  key: string,
  value: string | null
): Promise<void> {
  const before = getChat(chatId)?.customAttributes ?? {}
  const optimistic = { ...before }
  if (value === null) delete optimistic[key]
  else optimistic[key] = value

  patchChat(chatId, { customAttributes: optimistic })
  try {
    const { customAttributes } = await apiPut<{ customAttributes: Chat["customAttributes"] }>(
      `/chats/${chatId}/attributes`,
      { customAttributes: { [key]: value } }
    )
    patchChat(chatId, { customAttributes })
  } catch (error) {
    patchChat(chatId, { customAttributes: before })
    throw error
  }
}

/** Opção nova em campo de lista: sem reescrever o campo, para não apagar a de outra pessoa. */
export async function addFieldOption(fieldId: string, value: string): Promise<void> {
  await apiPost(`/custom-fields/${fieldId}/options`, { value })
  await globalMutate("/custom-fields")
}

/** Move a conversa no funil. `null` tira dele. */
export async function moveToFunnelStage(
  chatId: string,
  funnelId: string,
  stageId: string | null
): Promise<void> {
  const before = getChat(chatId)?.funnelStages ?? {}
  const optimistic = { ...before }
  if (stageId === null) delete optimistic[funnelId]
  else optimistic[funnelId] = stageId

  patchChat(chatId, { funnelStages: optimistic })
  try {
    const { chat } = await apiPut<ChatResponse>(`/funnels/${funnelId}/chats/${chatId}`, { stageId })
    publishChat(chat)
  } catch (error) {
    patchChat(chatId, { funnelStages: before })
    throw error
  }
}
