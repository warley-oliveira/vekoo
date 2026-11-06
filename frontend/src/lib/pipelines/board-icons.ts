import {
  HandCoins,
  Headset,
  Kanban,
  PackageCheck,
  SquareKanban,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from "lucide-react"

// Os ícones dos modelos e dos pipelines vêm da API, pelo nome do lucide. Só os conhecidos: importar a
// coleção inteira por nome pesaria muito mais que este mapa.
const BOARD_ICONS: Record<string, LucideIcon> = {
  "hand-coins": HandCoins,
  headset: Headset,
  kanban: Kanban,
  "package-check": PackageCheck,
  "trending-up": TrendingUp,
  "user-plus": UserPlus,
}

export function boardIcon(name: string | null | undefined): LucideIcon {
  return (name && BOARD_ICONS[name]) || SquareKanban
}
