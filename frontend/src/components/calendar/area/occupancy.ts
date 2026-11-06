/** A partir daqui a turma avisa que está enchendo. Como na origem. */
const ALMOST_FULL = 0.8

export type OccupancyLevel = "free" | "almost" | "full"

/** Sem vagas definidas, a API trata a turma como cheia: a tela diz o mesmo. */
export function occupancyLevel(active: number, max: number | null): OccupancyLevel {
  const capacity = max ?? 0
  if (active >= capacity) return "full"
  return active / capacity >= ALMOST_FULL ? "almost" : "free"
}
