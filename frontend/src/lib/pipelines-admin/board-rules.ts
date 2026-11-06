import type { BoardBase } from "./types"

/** Metas são de receita: só quadro de vendas tem. */
export function hasGoals(board: Pick<BoardBase, "boardType">) {
  return board.boardType === "crm"
}
