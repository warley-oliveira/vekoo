import { cn } from "@/lib/utils"
import { occupancyLevel } from "./occupancy"

const LEVEL_COLOR = {
  free: "bg-foreground/60",
  almost: "bg-status-warning",
  full: "bg-status-danger",
} as const

/**
 * Quantas vagas estão ocupadas. Quieta enquanto há lugar: só ganha cor perto de lotar, e a cor sempre
 * vem com o número ao lado, para não depender dela.
 */
export function OccupancyBar({
  active,
  max,
  label,
  className,
}: {
  active: number
  max: number | null
  /** O texto que o leitor de tela ouve: "3 de 12 vagas ocupadas". */
  label: string
  className?: string
}) {
  const capacity = max ?? 0
  const ratio = capacity > 0 ? Math.min(active / capacity, 1) : 0

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={Math.min(active, capacity)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        style={{ width: `${ratio * 100}%` }}
        className={cn("h-full rounded-full", LEVEL_COLOR[occupancyLevel(active, max)])}
      />
    </div>
  )
}
