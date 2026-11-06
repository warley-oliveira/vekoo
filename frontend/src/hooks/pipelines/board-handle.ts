import { createContext, useContext } from "react"

import type { BoardDetail } from "@/lib/pipelines/types"

/**
 * O pipeline aberto, para quem precisa ler ou escrever nele sem assinar as mudanças. O objeto não
 * muda de identidade enquanto o pipeline for o mesmo, então colocá-lo num contexto não redesenha
 * ninguém. Quem desenha dados recebe o que precisa por prop.
 */
export type BoardHandle = {
  boardId: string
  /** O que está na tela, com o filtro avançado aplicado, se houver. */
  getBoard: () => BoardDetail | undefined
  mutateBoard: (update: (board: BoardDetail) => BoardDetail) => void
  revalidate: () => void
  /** Com filtro avançado, a tela tem só parte de cada etapa. */
  isServerFiltered: () => boolean
  /** Cards com escrita em andamento: o eco no canal não pode desfazer o otimista. */
  pending: Map<string, number>
}

export const BoardHandleContext = createContext<BoardHandle | null>(null)

export function useBoardHandle(): BoardHandle {
  const handle = useContext(BoardHandleContext)
  if (!handle) throw new Error("useBoardHandle precisa estar dentro de um pipeline aberto")
  return handle
}

export function markPending(handle: BoardHandle, cardId: string) {
  handle.pending.set(cardId, (handle.pending.get(cardId) ?? 0) + 1)
}

export function clearPending(handle: BoardHandle, cardId: string) {
  const left = (handle.pending.get(cardId) ?? 1) - 1
  if (left <= 0) handle.pending.delete(cardId)
  else handle.pending.set(cardId, left)
}
