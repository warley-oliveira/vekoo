// A conversa de criação — o lado do cliente de `/brands/:id/conversations`.
//
// O contrato é o mesmo do resto da API: camelCase, datas em milissegundos,
// erro como código. Módulo sem idioma: aqui só há códigos e formas; a tela
// traduz.
//
// A peça de cada variação **não** vem embutida: a variação carrega `pieceId` e
// a tela busca a imagem pelo caminho normal das peças. É o que faz o download,
// a galeria e o "gerar de novo" funcionarem sem código novo — e o que deixa a
// imagem aparecer sozinha quando o `PieceChannel` avisa que ficou pronta.

export type TurnKind = "create" | "adjust" | "vary"

export type TurnStatus = "thinking" | "answered" | "question" | "failed"

export type AgentVariation = {
  engineId: string
  format: "post" | "story"
  title: string
  values: Record<string, unknown>
  /** Uma linha em pt-BR: o que diferencia esta variação. */
  why: string | null
  pieceId: string
}

export type AgentUsage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** `agentInvalidPlan`: o agente não conseguiu preencher o motor nem na correção. */
export type AgentErrorCode = "failed" | "agentInvalidPlan" | "brandNotPublished"

export type AgentTurn = {
  id: string
  conversationId: string
  kind: TurnKind
  status: TurnStatus
  prompt: string
  basePieceId: string | null
  attachments: string[]
  /** O agente perguntou em vez de inventar um fato. */
  question: string | null
  variations: AgentVariation[]
  error: { code: AgentErrorCode; details?: string[] } | null
  creditsCharged: number
  usage: AgentUsage
  /** O que a chamada custou, em milionésimos de dólar. */
  costMicroUsd: number
  model: string | null
  createdAt: number
  updatedAt: number
}

export type Conversation = {
  id: string
  brandId: string
  title: string
  turns: AgentTurn[]
  createdAt: number
  lastTurnAt: number
}

export type ConversationSummary = {
  id: string
  brandId: string
  title: string
  turnCount: number
  createdAt: number
  lastTurnAt: number
}

export type StartTurnInput = {
  kind?: TurnKind
  prompt?: string
  basePieceId?: string
  attachments?: string[]
}

/** Quantos exemplos o campo vazio mostra, em rodízio. */
export const PLACEHOLDER_COUNT = 5

export function conversationHref(brandId: string, id: string): string {
  return `/brands/${brandId}/create/${id}`
}

/** O turno ainda está pensando — é o que segura o compositor. */
export function isBusy(conversation: Conversation | undefined): boolean {
  return Boolean(conversation?.turns.some((turn) => turn.status === "thinking"))
}

export function lastTurn(conversation: Conversation | undefined): AgentTurn | undefined {
  return conversation?.turns[conversation.turns.length - 1]
}

/**
 * A última peça que o agente entregou — a base implícita de "deixa o fundo
 * mais escuro" quando a pessoa não escolheu nenhuma.
 */
export function lastVariation(conversation: Conversation | undefined): AgentVariation | undefined {
  const turns = conversation?.turns ?? []
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const variation = turns[i].variations[0]
    if (variation) return variation
  }
  return undefined
}
