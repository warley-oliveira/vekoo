import { mutate as globalMutate } from "swr"

import { apiDelete, apiPatch, apiPost, apiUpload } from "@/lib/api"
import {
  getChat,
  patchChat,
  publishChat,
  removeChat,
  requestListResync,
  storeChats,
} from "./chat-store"
import { applyDeleted, applyOwnReaction, patchMessage, useThreadStore } from "./thread-store"
import type {
  BulkDeleteResponse,
  Chat,
  ChatMessage,
  ChatResponse,
} from "./types"

// As ações sobre conversa e mensagem, sem React. Rejeitam com `ApiError`: quem chama dá o retorno
// à pessoa. Toda conversa que volta da API passa por `publishChat`, para lista, cabeçalho e painel
// lateral verem a mesma coisa.

export type ChatChanges = Partial<
  Pick<Chat, "automationEnabled" | "assignedAccountId" | "teamId" | "notes" | "status" | "displayName">
>

/**
 * `PATCH /chats/:id`, otimista. Em falha, volta ao valor anterior e rejeita. Toda escrita da
 * conversa deve vir por aqui: é o que `fe-chat-details` usa para atribuir, notas e departamento.
 */
export async function updateChat(chatId: string, changes: ChatChanges): Promise<Chat> {
  const before = getChat(chatId)
  patchChat(chatId, changes)

  try {
    const { chat } = await apiPatch<ChatResponse>(`/chats/${chatId}`, { chat: changes })
    return publishChat(chat)
  } catch (error) {
    if (before) {
      const undo = Object.fromEntries(
        Object.keys(changes).map((key) => [key, before[key as keyof Chat]])
      )
      patchChat(chatId, undo)
    }
    throw error
  }
}

export async function deleteChat(chatId: string): Promise<void> {
  await apiDelete(`/chats/${chatId}`)
  removeChat(chatId)
}

export async function createChat(input: {
  connectorId: string
  externalId: string
  userName?: string | null
  phoneNumberId?: string | null
}): Promise<Chat> {
  const { chat } = await apiPost<ChatResponse>("/chats", input)
  return publishChat(chat)
}

/** Reage na hora e, se o servidor recusar, volta como estava. */
export async function reactToMessage(
  chatId: string,
  message: ChatMessage,
  emoji: string,
  senderName?: string
): Promise<void> {
  const before = message.reactions
  patchMessage(chatId, message.id, {
    reactions: applyOwnReaction(before, emoji, senderName),
  })

  try {
    const response = await apiPost<{ message: ChatMessage }>(
      `/chats/${chatId}/messages/${message.id}/reaction`,
      { emoji }
    )
    patchMessage(chatId, message.id, { reactions: response.message.reactions })
  } catch (error) {
    patchMessage(chatId, message.id, { reactions: before })
    throw error
  }
}

/** Apaga em lote, só daqui: é o mesmo caminho para uma mensagem só. O contato continua vendo. */
export async function deleteMessages(chatId: string, messageIds: string[]): Promise<BulkDeleteResponse> {
  const response = await apiPost<BulkDeleteResponse>(`/chats/${chatId}/messages/bulk-delete`, {
    messageIds,
  })
  applyDeleted(chatId, response.deletedIds)
  return response
}

export async function sendAudio(
  chatId: string,
  audio: Blob,
  fileName: string,
  options?: { signal?: AbortSignal }
): Promise<ChatMessage> {
  const form = new FormData()
  form.append("audio", audio, fileName)
  const { message } = await apiUpload<{ message: ChatMessage }>(
    `/chats/${chatId}/messages/audio`,
    form,
    options
  )
  return message
}

export async function sendFiles(
  chatId: string,
  files: File[],
  options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal }
): Promise<ChatMessage[]> {
  const form = new FormData()
  for (const file of files) form.append("files[]", file, file.name)

  const { messages } = await apiUpload<{ messages: ChatMessage[] }>(
    `/chats/${chatId}/messages/attachments`,
    form,
    options
  )
  return messages
}

/** Tira uma etiqueta, por `fe-chat-details` e pela regra do `aguardando-operador`. */
export async function removeTagFromChat(chatId: string, tagId: string): Promise<void> {
  const { tagIds } = await apiDelete<{ tagIds: string[] }>(`/chat-tags/${tagId}/chats/${chatId}`)
  patchChat(chatId, { tagIds })
}

/**
 * Depois de uma ação em lote: ela não avisa o tempo real, então quem fez recarrega. Deixa a lista
 * conferir a primeira página e tira as conversas do cache de quem depende de `/chats/:id`.
 */
export function afterBulkAction(changedChats?: Chat[]): void {
  if (changedChats) storeChats(changedChats)
  requestListResync()
  void globalMutate((key) => typeof key === "string" && key.startsWith("/unified-contacts"))
}

/** O que a primeira página trouxe de metadados da conversa, para o painel lateral. */
export function threadMetadata(chatId: string) {
  const thread = useThreadStore.getState().threads[chatId]
  return {
    attributeList: thread?.attributeList ?? [],
    connectorProvider: thread?.connectorProvider ?? null,
  }
}
