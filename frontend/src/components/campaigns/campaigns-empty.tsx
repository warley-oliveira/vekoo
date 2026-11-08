import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Gauge, MessageSquareText, Plus, Users } from "lucide-react"

import { Button } from "@/components/ui/button"

const STEPS = [
  { key: "write", icon: MessageSquareText },
  { key: "choose", icon: Users },
  { key: "follow", icon: Gauge },
] as const

/**
 * Ainda não há campanha nenhuma. Quem chega aqui pela primeira vez não sabe o que é isso nem o que
 * vai acontecer: o estado vazio ensina em três passos e leva a criar a primeira.
 */
export function CampaignsEmpty() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-8 rounded-xl border border-dashed px-4 py-10 md:px-10 md:py-14">
      <div className="max-w-xl space-y-2 text-center">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-balance md:text-2xl">
          {t("campaigns.empty.title")}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("campaigns.empty.description")}</p>
      </div>

      <ol className="grid w-full max-w-3xl gap-3 md:grid-cols-3">
        {STEPS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex gap-3 rounded-lg bg-muted/40 p-3 md:flex-col">
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{t(`campaigns.empty.steps.${key}.title`)}</p>
              <p className="text-sm text-pretty text-muted-foreground">
                {t(`campaigns.empty.steps.${key}.description`)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Button nativeButton={false} className="pointer-coarse:h-10" render={<Link to="/campaigns/new" />}>
        <Plus />
        {t("campaigns.list.create")}
      </Button>
    </div>
  )
}
