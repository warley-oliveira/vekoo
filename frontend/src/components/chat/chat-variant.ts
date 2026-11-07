import { createContext, useContext, type ComponentType, type RefObject } from "react"

import type { RowAction } from "@/components/shared"
import type { ChatMessage } from "@/lib/chat/types"
import type { ComposerBoxProps } from "./composer/composer"
import type { ThreadHeaderProps } from "./thread/thread-header"

export type SelectionChromeProps = {
  count: number
  loadedCount: number
  primary: RowAction[]
  secondary: RowAction[]
  onExit: () => void
  onClear: () => void
  onSelectLoaded: () => void
}

/**
 * O que muda no chat conforme o tamanho da tela. A tela é uma só, com os mesmos stores: só as peças
 * que dependem de dedo e polegar têm outra forma, e quem as escolhe é `ChatLayout`. Fora do celular
 * não há variante, e cada ponto de encaixe usa a peça da tela larga. Assim essas peças nem descem
 * para quem não vai usar.
 */
export type ChatVariant = {
  ThreadHeader: ComponentType<ThreadHeaderProps>
  ThreadHeaderSkeleton: ComponentType<{ onBack: () => void }>
  ComposerBox: ComponentType<ComposerBoxProps>
  /** As ações de uma mensagem, em folha. Mora dentro de `ThreadContext`. */
  MessageSheet: ComponentType
  /** Deslizar a bolha para a direita responde. Ouve o histórico que recebe. */
  SwipeReply: ComponentType<{
    containerRef: RefObject<HTMLElement | null>
    onReply: (message: ChatMessage) => void
  }>
  /** As barras de quem está escolhendo conversas. */
  SelectionChrome: ComponentType<SelectionChromeProps>
}

export const ChatVariantContext = createContext<ChatVariant | null>(null)

export function useChatVariant(): ChatVariant | null {
  return useContext(ChatVariantContext)
}
