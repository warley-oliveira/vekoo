import type { BoardDetail, BoardEvent, Card, Stage, StageWithCards } from "./types"

// Como o quadro muda, sem React. Todas as funções preservam a identidade do que não mudou: o
// `React.memo` das etapas e dos cards depende disso, e é o que faz um evento de tempo real
// redesenhar um card só em vez do quadro inteiro.

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Junta o que veio da API com o que já estava na tela, reaproveitando o que não mudou. */
export function reconcileBoard(previous: BoardDetail | undefined, next: BoardDetail): BoardDetail {
  if (!previous || previous.id !== next.id) return next

  const previousCards = new Map<string, Card>()
  for (const stage of previous.stages) {
    for (const card of stage.cards) previousCards.set(card.id, card)
  }
  const previousStages = new Map(previous.stages.map((stage) => [stage.id, stage]))

  const stages = next.stages.map((stage) => {
    const cards = stage.cards.map((card) => {
      const known = previousCards.get(card.id)
      return known && same(known, card) ? known : card
    })

    const knownStage = previousStages.get(stage.id)
    if (
      knownStage &&
      knownStage.name === stage.name &&
      knownStage.position === stage.position &&
      knownStage.color === stage.color &&
      knownStage.wipLimit === stage.wipLimit &&
      knownStage.slaHours === stage.slaHours &&
      knownStage.cards.length === cards.length &&
      knownStage.cards.every((card, index) => card === cards[index])
    ) {
      return knownStage
    }
    return { ...stage, cards }
  })

  return {
    ...next,
    stages,
    customFields: same(previous.customFields, next.customFields)
      ? previous.customFields
      : next.customFields,
  }
}

function replaceStage(
  board: BoardDetail,
  stageId: string,
  update: (stage: StageWithCards) => StageWithCards
): BoardDetail {
  let changed = false
  const stages = board.stages.map((stage) => {
    if (stage.id !== stageId) return stage
    const next = update(stage)
    if (next !== stage) changed = true
    return next
  })
  return changed ? { ...board, stages } : board
}

export function findCard(
  board: BoardDetail,
  cardId: string
): { card: Card; stage: StageWithCards; index: number } | null {
  for (const stage of board.stages) {
    const index = stage.cards.findIndex((card) => card.id === cardId)
    if (index >= 0) return { card: stage.cards[index], stage, index }
  }
  return null
}

function withCardAt(cards: Card[], card: Card, index: number): Card[] {
  const next = [...cards]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, card)
  return next
}

export function removeCard(board: BoardDetail, cardId: string): BoardDetail {
  const found = findCard(board, cardId)
  if (!found) return board
  return replaceStage(board, found.stage.id, (stage) => ({
    ...stage,
    cards: stage.cards.filter((card) => card.id !== cardId),
  }))
}

/** Põe o card em `stageId`, no índice pedido da lista. É o otimista do arrastar e o "Mover para…". */
export function placeCard(
  board: BoardDetail,
  cardId: string,
  stageId: string,
  index: number,
  patch?: Partial<Card>
): BoardDetail {
  const found = findCard(board, cardId)
  if (!found) return board

  const moved = { ...found.card, ...patch, stageId }

  if (found.stage.id === stageId) {
    return replaceStage(board, stageId, (stage) => {
      const without = stage.cards.filter((card) => card.id !== cardId)
      return { ...stage, cards: withCardAt(without, moved, index) }
    })
  }

  return {
    ...board,
    stages: board.stages.map((stage) => {
      if (stage.id === found.stage.id) {
        return { ...stage, cards: stage.cards.filter((card) => card.id !== cardId) }
      }
      if (stage.id === stageId) return { ...stage, cards: withCardAt(stage.cards, moved, index) }
      return stage
    }),
  }
}

/** Onde entra um card vindo do servidor: `position` conta também o que esta tela não mostra. */
function indexForPosition(cards: Card[], position: number | null | undefined): number {
  if (!position) return cards.length
  const index = cards.findIndex((card) => card.position >= position)
  return index < 0 ? cards.length : index
}

/**
 * O card como o servidor diz que ele está. Sem `chatSummary` nos eventos, o que já se sabia da
 * conversa continua: é por isso que o `merge` parte do que está na tela.
 */
export function upsertCard(board: BoardDetail, incoming: Card): BoardDetail {
  if (incoming.archived) return removeCard(board, incoming.id)

  const found = findCard(board, incoming.id)
  if (!found) {
    if (!board.stages.some((stage) => stage.id === incoming.stageId)) return board
    return replaceStage(board, incoming.stageId, (stage) => ({
      ...stage,
      cards: withCardAt(stage.cards, incoming, indexForPosition(stage.cards, incoming.position)),
    }))
  }

  const merged = { ...found.card, ...incoming }

  if (found.stage.id !== incoming.stageId) {
    const target = board.stages.find((stage) => stage.id === incoming.stageId)
    if (!target) return removeCard(board, incoming.id)
    return placeCard(
      board,
      incoming.id,
      incoming.stageId,
      indexForPosition(target.cards, incoming.position),
      merged
    )
  }

  if (same(found.card, merged)) return board

  return replaceStage(board, found.stage.id, (stage) => ({
    ...stage,
    cards: stage.cards.map((card) => (card.id === incoming.id ? merged : card)),
  }))
}

export function patchCard(board: BoardDetail, cardId: string, patch: Partial<Card>): BoardDetail {
  const found = findCard(board, cardId)
  if (!found) return board
  return replaceStage(board, found.stage.id, (stage) => ({
    ...stage,
    cards: stage.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
  }))
}

export function orderCards(board: BoardDetail, stageId: string, orderedIds: string[]): BoardDetail {
  return replaceStage(board, stageId, (stage) => {
    const byId = new Map(stage.cards.map((card) => [card.id, card]))
    const known = new Set(orderedIds)
    const ordered = orderedIds.flatMap((id) => byId.get(id) ?? [])
    const rest = stage.cards.filter((card) => !known.has(card.id))
    const cards = [...ordered, ...rest]
    return cards.every((card, index) => card === stage.cards[index]) ? stage : { ...stage, cards }
  })
}

function orderStages(board: BoardDetail, orderedIds: string[]): BoardDetail {
  const byId = new Map(board.stages.map((stage) => [stage.id, stage]))
  const known = new Set(orderedIds)
  return {
    ...board,
    stages: [
      ...orderedIds.flatMap((id) => byId.get(id) ?? []),
      ...board.stages.filter((stage) => !known.has(stage.id)),
    ],
  }
}

function upsertStage(board: BoardDetail, incoming: Stage): BoardDetail {
  if (board.stages.some((stage) => stage.id === incoming.id)) {
    return {
      ...board,
      stages: board.stages.map((stage) =>
        stage.id === incoming.id ? { ...stage, ...incoming, cards: stage.cards } : stage
      ),
    }
  }
  return { ...board, stages: [...board.stages, { ...incoming, cards: [] }] }
}

/** Aplica um evento do canal. Os de comentário mudam só a contagem aqui; o resto é do painel. */
export function applyBoardEvent(board: BoardDetail, message: BoardEvent): BoardDetail {
  switch (message.event) {
    case "card_created":
    case "card_updated":
    case "card_moved":
      return upsertCard(board, message.data)
    case "card_deleted":
      return removeCard(board, message.data.id)
    case "cards_reordered":
      return orderCards(board, message.data.stageId, message.data.orderedIds)
    case "stage_created":
    case "stage_updated":
      return upsertStage(board, message.data)
    case "stage_deleted":
      return { ...board, stages: board.stages.filter((stage) => stage.id !== message.data.id) }
    case "stages_reordered":
      return orderStages(board, message.data.orderedIds)
    case "comment_created": {
      const found = findCard(board, message.data.cardId)
      return found
        ? patchCard(board, found.card.id, { commentsCount: found.card.commentsCount + 1 })
        : board
    }
    case "comment_deleted": {
      const found = findCard(board, message.data.cardId)
      return found
        ? patchCard(board, found.card.id, {
            commentsCount: Math.max(0, found.card.commentsCount - 1),
          })
        : board
    }
    default:
      return board
  }
}

/**
 * Soltar um card numa lista filtrada: a posição que a API espera é na lista inteira da etapa. O
 * vizinho de cima (ou, sem ele, o de baixo) é o que a pessoa escolheu, e é a partir dele que se
 * acha o lugar no meio dos cards que o filtro esconde.
 */
export function fullListIndex(
  fullIds: string[],
  cardId: string,
  previousVisibleId: string | null,
  nextVisibleId: string | null
): number {
  const without = fullIds.filter((id) => id !== cardId)
  if (previousVisibleId) {
    const index = without.indexOf(previousVisibleId)
    if (index >= 0) return index + 1
  }
  if (nextVisibleId) {
    const index = without.indexOf(nextVisibleId)
    if (index >= 0) return index
  }
  return without.length
}
