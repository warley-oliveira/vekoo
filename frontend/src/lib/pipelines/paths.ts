// Os caminhos da API, num lugar só: a chave do SWR é o próprio caminho, então é daqui também que
// sai o prefixo para invalidar uma família inteira.

export const BOARDS_PATH = "/pipelines/boards"
export const LABELS_PATH = "/pipelines/labels"
export const TEMPLATES_PATH = "/pipelines/templates"

export const boardPath = (boardId: string) => `${BOARDS_PATH}/${boardId}`
export const cardsPath = (boardId: string) => `${boardPath(boardId)}/cards`
export const cardPath = (boardId: string, cardId: string) => `${cardsPath(boardId)}/${cardId}`
export const savedFiltersPath = (boardId: string) => `${boardPath(boardId)}/saved-filters`

export type BoardView = "board" | "list" | "forecast"

/** O endereço de uma visão do pipeline. */
export const boardViewUrl = (boardId: string, view: BoardView = "board") =>
  `/pipelines/${boardId}/${view}`

/** Reconhece a visão pela URL: sem ela, ou com uma que não existe, é o quadro. */
export function parseBoardView(value: string | undefined): BoardView {
  return value === "list" || value === "forecast" ? value : "board"
}
