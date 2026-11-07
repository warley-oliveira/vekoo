import { memo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  CalendarClock,
  CheckCheck,
  CircleAlert,
  CircleSlash,
  FilePlus2,
  Pause,
  Play,
  PlugZap,
  Send,
  Unplug,
} from "lucide-react"

import { SectionCard, Timeline, type StatusTone, type TimelineItem } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { ActivityEvent } from "@/lib/campaigns/types"

const VISIBLE = 6

const ACTIONS: Record<string, { icon: ReactNode; tone: StatusTone }> = {
  created: { icon: <FilePlus2 />, tone: "neutral" },
  scheduled: { icon: <CalendarClock />, tone: "info" },
  launched: { icon: <Send />, tone: "accent" },
  paused: { icon: <Pause />, tone: "warning" },
  resumed: { icon: <Play />, tone: "accent" },
  cancelled: { icon: <CircleSlash />, tone: "neutral" },
  completed: { icon: <CheckCheck />, tone: "success" },
  launch_failed: { icon: <CircleAlert />, tone: "danger" },
  channel_stopped: { icon: <Unplug />, tone: "warning" },
  channel_resumed: { icon: <PlugZap />, tone: "success" },
}

/** A história da campanha. A frase de cada passo vem pronta da API, no idioma da requisição. */
export const ActivityCard = memo(function ActivityCard({ events }: { events: ActivityEvent[] }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const shown = expanded ? events : events.slice(0, VISIBLE)
  const items: TimelineItem[] = shown.map((event) => {
    const known = ACTIONS[event.action]
    const key = `campaigns.activity.${event.action}`
    return {
      id: event.id,
      icon: known?.icon,
      tone: known?.tone ?? "neutral",
      title: i18n.exists(key) ? t(key) : event.action,
      description: event.details,
      time: event.occurredAt,
    }
  })

  return (
    <SectionCard title={t("campaigns.activity.title")}>
      {items.length > 0 ? (
        <Timeline items={items} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("campaigns.activity.empty")}</p>
      )}
      {events.length > VISIBLE ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 w-full pointer-coarse:h-10"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? t("campaigns.activity.showLess")
            : t("campaigns.activity.showAll", { count: events.length })}
        </Button>
      ) : null}
    </SectionCard>
  )
})
