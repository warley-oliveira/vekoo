import { addDaysToKey, dayKeyOf, dayKeyOfLocal } from "@/lib/calendar/timezone"
import type { BlockedTime } from "@/lib/calendar/types"
import { toTimeInputValue } from "@/lib/date-format"

// Bloqueio é hora de parede no fuso do calendário, em texto: "2030-01-14 13:00". O campo de data do
// kit lê os campos locais de um `Date`, então o texto vira um `Date` com esses mesmos campos, e
// nunca um instante: quem abre a tela em outro fuso continua vendo "13:00".

const WALL_FORMAT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/

export function parseWall(text: string): Date | null {
  const match = WALL_FORMAT.exec(text)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  return new Date(year, month - 1, day, hour, minute)
}

export function formatWall(date: Date): string {
  return `${dayKeyOfLocal(date)} ${toTimeInputValue(date)}`
}

/** O texto no formato exato, e os bloqueios em ordem de início: é assim que o formulário os guarda. */
export function normalizeBlockedTimes(blocks: BlockedTime[] | null | undefined): BlockedTime[] {
  return (blocks ?? [])
    .map(({ start, end }) => {
      const startDate = parseWall(start)
      const endDate = parseWall(end)
      return {
        start: startDate ? formatWall(startDate) : start,
        end: endDate ? formatWall(endDate) : end,
      }
    })
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function blockedProblem(block: BlockedTime): "incomplete" | "startAfterEnd" | null {
  if (!parseWall(block.start) || !parseWall(block.end)) return "incomplete"
  return block.start < block.end ? null : "startAfterEnd"
}

/** O dia seguinte inteiro, no fuso do calendário: dali a pessoa só ajusta. */
export function newBlock(timeZone: string): BlockedTime {
  const day = addDaysToKey(dayKeyOf(Date.now(), timeZone), 1)
  return { start: `${day} 09:00`, end: `${day} 18:00` }
}

/** Mudou o início para depois do fim: o fim anda junto, mantendo a duração. */
export function withStart(block: BlockedTime, next: Date): BlockedTime {
  const start = formatWall(next)
  const previousStart = parseWall(block.start)
  const previousEnd = parseWall(block.end)
  if (!previousStart || !previousEnd || start < block.end) return { ...block, start }

  const duration = Math.max(previousEnd.getTime() - previousStart.getTime(), 60 * 60 * 1000)
  return { start, end: formatWall(new Date(next.getTime() + duration)) }
}
