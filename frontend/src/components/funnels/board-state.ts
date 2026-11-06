import type { StageRow } from "@/components/dashboard/funnel-stages"
import type { BoardChat, BoardColumn, BoardMetrics, DateField, FunnelBoard } from "./types"

// O quadro é um documento só no cache do SWR, e mexer nele à mão precisa manter as contagens e as
// métricas de pé. Tudo puro, para o otimista e a volta atrás usarem o mesmo caminho.

/** `Funnel::MAX_STAGES`. */
export const MAX_STAGES = 30

/** Como a página entra na URL, e como a tela identifica a coluna. */
export function columnKey(stageId: string | null): string {
  return stageId ?? "none"
}

/**
 * O cartão diz o que a coluna diz. A etapa apagada continua gravada na conversa até o job passar, e o
 * servidor já a põe em "Sem etapa": sem isto, o cartão ali dentro acharia que está em outro lugar.
 */
export function normalizeBoard(board: FunnelBoard): FunnelBoard {
  const needsFix = board.columns.some((column) => column.chats.some((chat) => chat.stageId !== column.stageId))
  if (!needsFix) return board
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      chats: column.chats.map((chat) =>
        chat.stageId === column.stageId ? chat : { ...chat, stageId: column.stageId }
      ),
    })),
  }
}

/** A mesma conta de `ChatFunnel`: quem está numa etapa passou pelas anteriores. */
function metricsOf(columns: BoardColumn[], total: number): BoardMetrics {
  const stageColumns = columns.filter((column) => column.stageId !== null)
  const counts = stageColumns.map((column) => column.count)

  let running = 0
  const reached = [...counts]
    .reverse()
    .map((count) => (running += count))
    .reverse()
  const first = reached[0] ?? 0

  return {
    total,
    noStage: columns.find((column) => column.stageId === null)?.count ?? 0,
    perStageCounts: counts,
    reachedCounts: reached,
    conversionRates: reached.map((count) => (first > 0 ? Math.round((count / first) * 1000) / 10 : 0)),
  }
}

/** A API ordena pelo campo de data do filtro. Um cartão movido entra no lugar dele, e não no fim. */
function sortChats(chats: BoardChat[], dateField: DateField): BoardChat[] {
  const stamp = (chat: BoardChat) => (dateField === "created_at" ? chat.createdAt : chat.lastMessageAt) ?? 0
  return [...chats].sort((a, b) => stamp(b) - stamp(a) || (a.id < b.id ? 1 : -1))
}

export function moveInBoard(
  board: FunnelBoard,
  chat: BoardChat,
  toStageId: string | null,
  dateField: DateField
): FunnelBoard {
  const fromStageId =
    board.columns.find((column) => column.chats.some((entry) => entry.id === chat.id))?.stageId ?? chat.stageId
  if (fromStageId === toStageId) return board

  const moved = { ...chat, stageId: toStageId }
  const columns = board.columns.map((column) => {
    if (column.stageId === fromStageId) {
      return {
        ...column,
        count: Math.max(column.count - 1, 0),
        chats: column.chats.filter((entry) => entry.id !== chat.id),
      }
    }
    if (column.stageId === toStageId) {
      return {
        ...column,
        count: column.count + 1,
        chats: sortChats([...column.chats, moved], dateField),
      }
    }
    return column
  })

  return { ...board, columns, metrics: metricsOf(columns, board.metrics.total) }
}

/** Junta uma página à coluna, sem repetir: quem foi movido desloca a paginação do servidor. */
export function mergePage(board: FunnelBoard, fetched: BoardColumn, dateField: DateField): FunnelBoard {
  const columns = board.columns.map((column) => {
    if (column.stageId !== fetched.stageId) return column
    const known = new Set(column.chats.map((chat) => chat.id))
    const added = fetched.chats.filter((chat) => !known.has(chat.id))
    return {
      ...column,
      page: fetched.page,
      count: fetched.count,
      // Sem nada novo e sem mais páginas, a contagem é que estava à frente: o botão some.
      hasMore: fetched.hasMore,
      chats: sortChats([...column.chats, ...added], dateField),
    }
  })
  return { ...board, columns }
}

export function patchChatInBoard(
  board: FunnelBoard,
  chatId: string,
  patch: Partial<BoardChat>
): FunnelBoard {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.chats.some((chat) => chat.id === chatId)
        ? {
            ...column,
            chats: column.chats.map((chat) => (chat.id === chatId ? { ...chat, ...patch } : chat)),
          }
        : column
    ),
  }
}

/** Quantas conversas a coluna ainda não trouxe, com o botão de carregar valendo. */
export function remainingIn(column: BoardColumn): number {
  return Math.max(column.count - column.chats.length, 0)
}

/** As métricas do quadro, no formato do gráfico de etapas. */
export function stageRows(board: FunnelBoard): StageRow[] {
  const { perStageCounts, reachedCounts, conversionRates } = board.metrics
  const stages = board.columns.filter((column) => column.stageId !== null)
  return stages.map((column, index) => ({
    id: column.stageId as string,
    name: column.stageName,
    count: perStageCounts[index] ?? 0,
    reached: reachedCounts[index] ?? 0,
    conversionRate: conversionRates[index] ?? 0,
    stepRate:
      index === 0 || !reachedCounts[index - 1]
        ? 100
        : Math.round(((reachedCounts[index] ?? 0) / reachedCounts[index - 1]) * 1000) / 10,
  }))
}
