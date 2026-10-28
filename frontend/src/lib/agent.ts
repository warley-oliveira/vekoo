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

import type { BrandAsset } from "@/lib/brand-core"
import type { DocumentFormat } from "@/lib/piece-document"

export type TurnKind = "create" | "adjust" | "vary"

export type TurnStatus = "thinking" | "answered" | "question" | "failed"

/**
 * Uma variação como o agente a escreveu: a forma compacta do documento
 * (layout + conteúdo por slot). A peça de verdade está em `pieceId`.
 */
export type AgentVariation = {
  format: DocumentFormat
  title: string
  slides: Array<{ layout: string; content: Record<string, string | boolean | null> }>
  /** Uma linha em pt-BR: o que diferencia esta variação. */
  why: string | null
  pieceId: string
}

/**
 * Um passo do agente enquanto pensa — hoje, cada foto que ele pediu ao
 * gerador (`generate_image`). Chega ao vivo pelo `AgentChannel`: rodando,
 * depois pronto (com as fotos) ou falhou (com o código).
 */
export type AgentStep = {
  id: string
  kind: "image"
  status: "running" | "done" | "failed"
  /** O rótulo curto que o agente escreveu para a foto ("pão de queijo saindo do forno"). */
  caption: string
  aspectRatio: "4:5" | "1:1" | "9:16"
  count: number
  error: "blocked" | "failed" | "unavailable" | "noCredits" | "costCapReached" | null
  startedAt: number
  finishedAt: number | null
  assets: BrandAsset[]
}

export type AgentUsage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** `agentInvalidPlan`: o agente não conseguiu montar a peça nem na correção. */
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
  /** A trilha do que o agente fez enquanto pensava (as fotos criadas). */
  steps: AgentStep[]
  /** A pessoa pediu foto, não peça: o resultado são as fotos da trilha. */
  onlyImages: boolean
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

/**
 * Em que pé o turno está, para a linha de status: lendo o pedido, criando
 * foto ou montando as peças (já com as fotos prontas).
 */
export type TurnPhase = "reading" | "photo" | "composing"

export function turnPhase(turn: AgentTurn): TurnPhase {
  if (turn.steps.some((step) => step.status === "running")) return "photo"
  return turn.steps.length > 0 ? "composing" : "reading"
}

/** As fotos que o turno criou, na ordem em que saíram. */
export function turnPhotos(turn: AgentTurn): Array<{ asset: BrandAsset; step: AgentStep }> {
  return turn.steps.flatMap((step) => step.assets.map((asset) => ({ asset, step })))
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
