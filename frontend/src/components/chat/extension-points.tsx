import { lazy, Suspense, type ReactNode } from "react"

import type { ComposerMode } from "@/lib/chat/composer-mode"
import type { Chat } from "@/lib/chat/types"
import { ComposerActions } from "./details/composer-extras"
import { DetailsSkeleton } from "./details/details-skeleton"
import { ListActions } from "./details/list-extras"
import { ListSelectionStrip } from "./details/list-selection"
import {
  TemplateDialogHost,
  TemplateNoticeButton,
  ThreadMenuItems,
} from "./details/thread-extras"

// Os pontos de encaixe do chat: o que fica ao redor da lista, da conversa e do composer, sem mexer
// neles. Cada função já está no lugar certo da tela e recebe o que precisa. O que pesa entra por
// `lazy`: este arquivo carrega junto com a lista, e quase ninguém abre tudo o que está aqui.
//
// Para gravar qualquer coisa da conversa, use `updateChat` de `@/lib/chat/actions` (é otimista e
// reflete em lista, cabeçalho e painel). Para ler a conversa, `useChat(chatId)` de
// `@/lib/chat/chat-store`, ou só os campos que importam, com `useChatFields`.

const DetailsPanel = lazy(() => import("./details/details-panel"))

/** Enquanto não existia, escondia o botão do cabeçalho. */
export const HAS_DETAILS_PANEL = true

/**
 * O painel lateral: o contato e o copiloto. Mora na terceira coluna em tela larga; `ChatLayout` cuida
 * da largura e de abrir e fechar. Em tela estreita, aparece por cima da conversa. Sem conversa aberta,
 * só o copiloto faz sentido.
 */
export function ChatDetailsPanel({
  chatId,
  onClose,
}: {
  chatId: string | null
  onClose: () => void
}): ReactNode {
  return (
    <Suspense fallback={<DetailsSkeleton withHeader />}>
      <DetailsPanel chatId={chatId} onClose={onClose} />
    </Suspense>
  )
}

/**
 * Ações a mais no cabeçalho da conversa, antes do menu "...". Hoje não desenha botão: é o lugar do
 * diálogo de modelo, que precisa estar montado em todo modo do composer.
 */
export function ThreadHeaderExtras({ chat }: { chat: Chat }): ReactNode {
  return <TemplateDialogHost chatId={chat.id} />
}

/** Itens a mais no menu "..." do cabeçalho. */
export function ThreadMenuExtras({ chat }: { chat: Chat }): ReactNode {
  return <ThreadMenuItems chat={chat} />
}

/** Ações na linha de cima da lista, ao lado de "Nova conversa": copiloto, preferências, ações em lote. */
export function ListHeaderExtras(): ReactNode {
  return <ListActions />
}

/** A faixa de quem está escolhendo conversas, logo abaixo das abas da lista. */
export function ListSelection(): ReactNode {
  return <ListSelectionStrip />
}

/**
 * Botões a mais no composer, ao lado de anexar e emoji: resposta sugerida, modelo.
 * `insertText` escreve na posição do cursor; é o que a sugestão de resposta usa.
 */
export function ComposerExtras({
  chat,
  insertText,
  disabled,
}: {
  chat: Chat
  insertText: (text: string) => void
  disabled: boolean
}): ReactNode {
  return <ComposerActions chatId={chat.id} insertText={insertText} disabled={disabled} />
}

/**
 * O aviso do composer quando só cabe modelo (WABA fora da janela de 24 horas), logo abaixo do texto
 * que explica: é aqui que entra o envio de modelo.
 */
export function TemplateSender({ chat, mode }: { chat: Chat; mode: ComposerMode }): ReactNode {
  return mode === "waba-expired" ? <TemplateNoticeButton chatId={chat.id} /> : null
}
