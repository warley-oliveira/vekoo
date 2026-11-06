import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  BarChart3,
  Bot,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  FileText,
  Filter,
  LineChart,
  Loader2,
  MessageSquare,
  PieChart,
  Search,
  Send,
  Tag,
  TrendingUp,
  Trophy,
  TriangleAlert,
  User,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react"

import type { CopilotActivity } from "@/lib/chat-details/copilot-types"
import { cn } from "@/lib/utils"

// O servidor diz o nome; o desenho é daqui. Nome desconhecido não quebra.
const ICONS: Record<string, LucideIcon> = {
  search: Search,
  chat: MessageSquare,
  summary: FileText,
  tag: Tag,
  person: User,
  automation: Bot,
  calendar: CalendarDays,
  cancel: CalendarX,
  trending: TrendingUp,
  close: CheckCircle2,
  analytics: BarChart3,
  message: Send,
  group: Users,
  assessment: ClipboardList,
  leaderboard: Trophy,
  pie_chart: PieChart,
  event_available: CalendarCheck,
  show_chart: LineChart,
  filter_alt: Filter,
  schedule: Clock,
}

function contactLabel(activity: CopilotActivity): string | null {
  const { userName, phoneNumber } = activity.contact ?? {}
  if (userName && phoneNumber) return `${userName} (${phoneNumber})`
  return userName || phoneNumber || null
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const ActivityRow = memo(function ActivityRow({ activity }: { activity: CopilotActivity }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const running = activity.status === "started"
  const failed = activity.success === false
  const hasDetails = !running && (activity.input != null || activity.output != null)
  const Icon = running ? Loader2 : failed ? TriangleAlert : (ICONS[activity.icon] ?? Zap)
  const contact = contactLabel(activity)

  const line = (
    <>
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          running && "animate-spin",
          failed && "text-status-warning"
        )}
      />
      <span className="min-w-0 flex-1">
        {activity.description}
        {contact ? <span className="text-foreground/80"> {contact}</span> : null}
      </span>
    </>
  )

  return (
    <li>
      {hasDetails ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start gap-1.5 rounded-sm py-0.5 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-10 pointer-coarse:items-center"
        >
          {line}
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-3.5 shrink-0 transition-transform duration-150 pointer-coarse:mt-0",
              open && "rotate-180"
            )}
          />
        </button>
      ) : (
        <div className="flex items-start gap-1.5 py-0.5" role={running ? "status" : undefined}>
          {line}
        </div>
      )}

      {open ? (
        <div className="mt-1 mb-1.5 space-y-1.5 pl-5">
          {activity.input != null ? (
            <div>
              <p className="mb-0.5 font-medium">{t("chatDetails.copilot.activityInput")}</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[0.6875rem] leading-snug">
                {toJson(activity.input)}
              </pre>
            </div>
          ) : null}
          {activity.output != null ? (
            <div>
              <p className="mb-0.5 font-medium">{t("chatDetails.copilot.activityOutput")}</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[0.6875rem] leading-snug">
                {toJson(activity.output)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
})

/** O que o copiloto está fazendo, ou fez, na ordem. Baixo contraste: o que importa é a resposta. */
export const ActivityList = memo(function ActivityList({
  activities,
}: {
  activities: CopilotActivity[]
}) {
  return (
    <ul className="my-1 flex flex-col text-xs text-muted-foreground">
      {activities.map((activity, index) => (
        <ActivityRow key={`${activity.toolName}-${activity.timestamp}-${index}`} activity={activity} />
      ))}
    </ul>
  )
})
