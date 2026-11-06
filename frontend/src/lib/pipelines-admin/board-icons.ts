import {
  BriefcaseBusiness,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  HandCoins,
  Handshake,
  Headset,
  Heart,
  House,
  Kanban,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  PackageCheck,
  Phone,
  Receipt,
  Rocket,
  Scissors,
  Shirt,
  ShoppingBag,
  Star,
  Stethoscope,
  Store,
  Target,
  TrendingUp,
  Trophy,
  Truck,
  UserPlus,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react"

// Os ícones que um quadro pode ter, pelo nome do lucide, que é o que a API guarda: os modelos de
// quadro e a semente mandam `hand-coins`, `headset`, `trending-up`, `user-plus`. Uma lista curta, e
// não a biblioteca inteira: dá para bater o olho e escolher, e o pacote não leva 1.500 ícones.
export const BOARD_ICONS: Record<string, LucideIcon> = {
  kanban: Kanban,
  "hand-coins": HandCoins,
  "trending-up": TrendingUp,
  target: Target,
  trophy: Trophy,
  handshake: Handshake,
  wallet: Wallet,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  store: Store,
  "package-check": PackageCheck,
  truck: Truck,
  headset: Headset,
  "message-circle": MessageCircle,
  phone: Phone,
  mail: Mail,
  megaphone: Megaphone,
  "user-plus": UserPlus,
  "calendar-check": CalendarCheck,
  "clipboard-list": ClipboardList,
  "list-checks": ListChecks,
  "briefcase-business": BriefcaseBusiness,
  star: Star,
  heart: Heart,
  rocket: Rocket,
  wrench: Wrench,
  scissors: Scissors,
  shirt: Shirt,
  utensils: Utensils,
  stethoscope: Stethoscope,
  "graduation-cap": GraduationCap,
  house: House,
}

export const BOARD_ICON_NAMES = Object.keys(BOARD_ICONS)

export const DEFAULT_BOARD_ICON = "kanban"

/** Ícone de nome desconhecido, de outra versão ou escrito por API, cai no padrão. */
export function boardIcon(name: string | null | undefined): LucideIcon {
  return (name && BOARD_ICONS[name]) || BOARD_ICONS[DEFAULT_BOARD_ICON]
}
