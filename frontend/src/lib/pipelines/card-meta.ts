import type { BoardDetail, Card, DealStatus } from "./types"

// O que a tela calcula a partir do card, em um lugar só: o quadro, a lista e o painel precisam
// dizer a mesma coisa sobre o mesmo card.

const DAY_MS = 86_400_000

export function dealStatusOf(card: Pick<Card, "wonAt" | "lostAt">): DealStatus {
  if (card.wonAt) return "won"
  if (card.lostAt) return "lost"
  return "open"
}

/** Dias inteiros na etapa atual. */
export function agingDays(card: Pick<Card, "stageEnteredAt" | "createdAt">, now = Date.now()): number {
  const since = card.stageEnteredAt ?? card.createdAt
  return since ? Math.max(0, Math.floor((now - since) / DAY_MS)) : 0
}

export function isOverdue(card: Pick<Card, "dueDate" | "completedAt">, now = Date.now()): boolean {
  return Boolean(card.dueDate && !card.completedAt && card.dueDate < now)
}

export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** `2026-12-06` como data local: `new Date("2026-12-06")` é meia-noite em UTC, o dia anterior aqui. */
export function parseDayKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** "Fechamento previsto" é um dia, sem hora: vence depois que aquele dia acabou. */
export function isCloseOverdue(
  card: Pick<Card, "expectedCloseDate" | "wonAt" | "lostAt">,
  now = new Date()
): boolean {
  if (!card.expectedCloseDate || card.wonAt || card.lostAt) return false
  return card.expectedCloseDate < localDayKey(now)
}

export type LeadScoreConfig = {
  fieldKey: string
  low: number
  high: number
}

export function leadScoreConfigOf(
  board: Pick<BoardDetail, "leadScoreFieldKey" | "leadScoreLow" | "leadScoreHigh">
): LeadScoreConfig | null {
  if (!board.leadScoreFieldKey) return null
  return {
    fieldKey: board.leadScoreFieldKey,
    low: board.leadScoreLow ?? 30,
    high: board.leadScoreHigh ?? 70,
  }
}

export function leadScoreOf(
  card: Pick<Card, "customFieldValues">,
  config: LeadScoreConfig | null
): number | null {
  if (!config) return null
  const raw = card.customFieldValues?.[config.fieldKey]
  if (raw === null || raw === undefined || raw === "") return null
  const score = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(score) ? score : null
}

export type LeadScoreTone = "cold" | "warm" | "hot"

export function leadScoreTone(score: number, config: LeadScoreConfig): LeadScoreTone {
  if (score >= config.high) return "hot"
  if (score >= config.low) return "warm"
  return "cold"
}

/** Quem está do outro lado: a conversa ligada, depois o que está no próprio card. */
export function contactNameOf(card: Card): string | null {
  const summary = card.chatSummary
  return (
    summary?.contactName ||
    summary?.contactPhone?.split("@")[0] ||
    card.contactPhone?.split("@")[0] ||
    card.contactEmail ||
    null
  )
}

export function contactPhoneOf(card: Card): string | null {
  return card.chatSummary?.contactPhone?.split("@")[0] || card.contactPhone || null
}

export type StageTotals = {
  count: number
  /** Soma dos cards com valor, fora os perdidos: perdido não é dinheiro na etapa. */
  total: number
  weighted: number
  withValue: number
}

export function stageTotals(cards: Card[]): StageTotals {
  let total = 0
  let weighted = 0
  let withValue = 0
  for (const card of cards) {
    const value = card.dealValue ?? 0
    if (value <= 0 || card.lostAt) continue
    total += value
    withValue += 1
    if (card.dealProbability) weighted += (value * card.dealProbability) / 100
  }
  return { count: cards.length, total, weighted, withValue }
}

export type BoardSummary = {
  openValue: number
  weightedValue: number
  openCount: number
  averageDeal: number
  /** `null` sem nenhum negócio fechado: "0%" afirmaria que ninguém converte. */
  conversionRate: number | null
  wonValue: number
}

export function boardSummary(stages: { cards: Card[] }[]): BoardSummary {
  let openValue = 0
  let weightedValue = 0
  let openCount = 0
  let wonCount = 0
  let lostCount = 0
  let wonValue = 0

  for (const stage of stages) {
    for (const card of stage.cards) {
      const value = card.dealValue ?? 0
      if (card.wonAt) {
        wonCount += 1
        wonValue += value
      } else if (card.lostAt) {
        lostCount += 1
      } else {
        openCount += 1
        openValue += value
        if (value > 0 && card.dealProbability) {
          weightedValue += (value * card.dealProbability) / 100
        }
      }
    }
  }

  const closed = wonCount + lostCount
  return {
    openValue,
    weightedValue,
    openCount,
    averageDeal: openCount > 0 ? openValue / openCount : 0,
    conversionRate: closed > 0 ? wonCount / closed : null,
    wonValue,
  }
}

/** `false` e `0` são respostas, não vazio. Como `Pipelines::CustomFieldValue` no back-end. */
export function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}
