import type { LucideIcon } from "lucide-react"
import {
  AreaChart,
  BarChart3,
  Bolt,
  CalendarDays,
  ChartColumn,
  ChartLine,
  ChartNoAxesCombined,
  ChartPie,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  Filter,
  Gauge,
  Grid3x3,
  Heart,
  Inbox,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  Minus,
  OctagonAlert,
  Phone,
  PieChart,
  Radar,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  Table2,
  Tag,
  Target,
  Ticket,
  TrendingUp,
  Type,
  Users,
  XCircle,
} from "lucide-react"

import type { WidgetType } from "@/lib/custom-dashboards/types"

// O ícone guardado é uma chave curta, e não o nome do componente: a lista pode mudar de biblioteca sem mexer no que está
// salvo. As da origem (`solar:...`) ou uma que o app não conheça caem no ícone padrão.

export const ICONS: Record<string, LucideIcon> = {
  chart: ChartNoAxesCombined,
  columns: ChartColumn,
  line: ChartLine,
  pie: ChartPie,
  dashboard: LayoutDashboard,
  money: DollarSign,
  users: Users,
  message: MessageCircle,
  bolt: Bolt,
  calendar: CalendarDays,
  tag: Tag,
  target: Target,
  rocket: Rocket,
  shield: ShieldCheck,
  clock: Clock,
  phone: Phone,
  inbox: Inbox,
  star: Star,
  heart: Heart,
  store: Store,
  cart: ShoppingCart,
  ticket: Ticket,
  compass: Compass,
  check: CheckCircle2,
  close: XCircle,
  alert: OctagonAlert,
}

export const DASHBOARD_ICON_KEYS = [
  "chart", "columns", "line", "pie", "dashboard", "money", "users", "message", "bolt", "calendar", "tag", "target",
  "rocket", "shield", "clock", "phone", "inbox", "star", "heart", "store", "cart", "ticket", "compass", "check",
] as const

export const WIDGET_ICON_KEYS = [
  "chart", "columns", "line", "users", "message", "calendar", "tag", "money", "clock", "check", "close", "alert",
  "bolt", "shield", "phone", "inbox", "star", "target", "rocket", "store",
] as const

export function iconFor(key: string | null | undefined): LucideIcon {
  return (key && ICONS[key]) || ChartNoAxesCombined
}

export const WIDGET_TYPE_ICONS: Record<WidgetType, LucideIcon> = {
  kpi: Gauge,
  number_trend: TrendingUp,
  gauge: Gauge,
  progress_bar: SlidersHorizontal,
  line_chart: LineChart,
  bar_chart: BarChart3,
  area_chart: AreaChart,
  pie_chart: PieChart,
  donut_chart: ChartPie,
  radar: Radar,
  heatmap: Grid3x3,
  table: Table2,
  funnel: Filter,
  rich_text: Type,
  section_divider: Minus,
}
