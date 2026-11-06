import { useTranslation } from "react-i18next"
import { BatteryCharging, CalendarDays, Link2, RefreshCw, Wifi } from "lucide-react"

import { cn } from "@/lib/utils"

const TIPS = [
  { key: "internet", icon: Wifi },
  { key: "weeklyOpen", icon: CalendarDays },
  { key: "autoUpdate", icon: RefreshCw },
  { key: "battery", icon: BatteryCharging },
  { key: "linkedDevices", icon: Link2 },
] as const

/** O que derruba um WhatsApp conectado pelo celular. Quem sabe disso perde menos conversa. */
export function WhatsappTips({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <section className={cn("rounded-xl bg-muted/50 p-4", className)}>
      <h4 className="text-sm font-medium">{t("connectors.tips.title")}</h4>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("connectors.tips.description")}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {TIPS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-2.5 text-sm">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="text-pretty">{t(`connectors.tips.${key}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
