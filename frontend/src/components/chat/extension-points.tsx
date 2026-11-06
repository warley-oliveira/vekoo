import type { ReactNode } from "react"

import type { ComposerMode } from "@/lib/chat/composer-mode"
import type { Chat } from "@/lib/chat/types"

// Os pontos de encaixe do chat. As próximas frentes (`fe-chat-details`, `fe-chat-mobile`) escrevem
// aqui, sem mexer na lista, no histórico nem no composer. Cada função já está no lugar certo da
// tela e recebe o que precisa. Hoje não desenham nada, a não ser quando dito.
//
// Para gravar qualquer coisa da conversa, use `updateChat` de `@/lib/chat/actions` (é otimista e
// reflete em lista, cabeçalho e painel). Para ler a conversa, `useChat(chatId)` de
// `@/lib/chat/chat-store`. Campos personalizados e provedor: `threadMetadata(chatId)`.

/**
 * O painel lateral: contato, atribuição, etiquetas, notas, atributos, ações agendadas, copiloto.
 *
 * Mora na terceira coluna em tela larga; `ChatLayout` já cuida da largura e de abrir e fechar, e o
 * botão do cabeçalho já alterna `useDetailsPanel`. Em tela estreita, ele aparece por cima da
 * conversa: o conteúdo é o mesmo, então um componente só basta.
 *
 * Enquanto não existe, `HAS_DETAILS_PANEL` esconde o botão.
 */
export const HAS_DETAILS_PANEL = false

export function ChatDetailsPanel(_props: { chatId: string; onClose: () => void }): ReactNode {
  return null
}

/** Ações a mais no cabeçalho da conversa, antes do menu "...". */
export function ThreadHeaderExtras(_props: { chat: Chat }): ReactNode {
  return null
}

/** Itens a mais no menu "..." do cabeçalho (use `DropdownMenuItem`). */
export function ThreadMenuExtras(_props: { chat: Chat }): ReactNode {
  return null
}

/** Ações na linha de cima da lista, ao lado de "Nova conversa": preferências, ações em lote. */
export function ListHeaderExtras(): ReactNode {
  return null
}

/**
 * Botões a mais no composer, ao lado de anexar e emoji: resposta sugerida, modelo.
 * `insertText` escreve na posição do cursor; é o que a sugestão de resposta deve usar.
 */
export function ComposerExtras(_props: {
  chat: Chat
  insertText: (text: string) => void
  disabled: boolean
}): ReactNode {
  return null
}

/**
 * O aviso do composer quando só cabe modelo (WABA fora da janela de 24 horas), logo abaixo do
 * texto que explica: é aqui que entra o envio de modelo. Depois de enviar um modelo, chame
 * `removeWaitingTagIfNeeded`, de `useAutoRemoveWaitingTag`.
 */
export function TemplateSender(_props: { chat: Chat; mode: ComposerMode }): ReactNode {
  return null
}
