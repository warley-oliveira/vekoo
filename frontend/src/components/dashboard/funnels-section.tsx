import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { ArrowRight } from "lucide-react"

import { EmptyState, TagChip } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { RankedBars, type RankedItem } from "./bars"
import { CardBoundary } from "./card-boundary"
import { CardEmpty, ChartCard } from "./chart-card"
import { FunnelFootnote, FunnelStages, useStagesTable } from "./funnel-stages"
import { sum } from "./series"
import type { FunnelStat } from "./types"

/** Quantos funis aparecem de cara. Até 50 por organização, e o resto do Dashboard fica acima. */
const FUNNELS_VISIBLE = 3
const TAGS_VISIBLE = 6

export function FunnelsSection({ funnels }: { funnels: FunnelStat[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canOpen = useCan("funnel")
  const [showAll, setShowAll] = useState(false)

  const withChats = useMemo(
    () => funnels.filter((funnel) => funnel.total > 0).sort((a, b) => b.total - a.total),
    [funnels]
  )
  const visible = showAll ? withChats : withChats.slice(0, FUNNELS_VISIBLE)
  const idle = funnels.length - withChats.length

  if (withChats.length === 0) {
    return (
      <EmptyState
        title={t(funnels.length ? "dashboard.funnel.noChatsTitle" : "dashboard.funnel.noFunnelsTitle")}
        description={t(funnels.length ? "dashboard.funnel.noChatsHint" : "dashboard.funnel.noFunnelsHint")}
        action={
          canOpen
            ? {
                label: t(funnels.length ? "dashboard.funnel.open" : "dashboard.funnel.create"),
                onClick: () => navigate("/funnels"),
              }
            : undefined
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {visible.map((funnel) => (
        <div key={funnel.id} className="grid gap-4 lg:grid-cols-12">
          <CardBoundary title={funnel.name} resetKey={funnel} className="lg:col-span-8">
            <FunnelCard funnel={funnel} className="lg:col-span-8" />
          </CardBoundary>
          <CardBoundary title={t("dashboard.tags.title")} resetKey={funnel} className="lg:col-span-4">
            <TagsCard funnel={funnel} className="lg:col-span-4" />
          </CardBoundary>
        </div>
      ))}

      {withChats.length > FUNNELS_VISIBLE || idle > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {withChats.length > FUNNELS_VISIBLE ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? t("dashboard.funnel.showLess")
                : t("dashboard.funnel.showAll", { count: withChats.length })}
            </Button>
          ) : null}
          {idle > 0 ? <span>{t("dashboard.funnel.idle", { count: idle })}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function FunnelCard({ funnel, className }: { funnel: FunnelStat; className?: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const canOpen = useCan("funnel")
  const table = useStagesTable(funnel.stages)
  const last = funnel.stages[funnel.stages.length - 1]

  return (
    <ChartCard
      title={funnel.name}
      description={funnel.description ?? undefined}
      className={className}
      table={table}
      summary={
        last
          ? t("dashboard.funnel.summary", {
              name: funnel.name,
              total: formatNumber(funnel.total, language),
              last: last.name,
              reached: formatNumber(last.reached, language),
            })
          : undefined
      }
      actions={
        canOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/funnels?funnel=${funnel.id}`)}
          >
            {t("dashboard.funnel.open")}
            <ArrowRight />
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <FunnelStages stages={funnel.stages} />
        <FunnelFootnote stages={funnel.stages} />
      </div>
    </ChartCard>
  )
}

/** Etiquetas mais usadas: nomes na cor que a pessoa escolheu, e barras neutras para comparar. */
function TagsCard({ funnel, className }: { funnel: FunnelStat; className?: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [showAll, setShowAll] = useState(false)

  const total = sum(funnel.tags.map((tag) => tag.count))
  const visible = showAll ? funnel.tags : funnel.tags.slice(0, TAGS_VISIBLE)
  const items: RankedItem[] = visible.map((tag) => ({
    id: tag.id,
    label: <TagChip color={tag.color}>{tag.name}</TagChip>,
    title: tag.name,
    value: tag.count,
    valueLabel: formatNumber(tag.count, language),
    shareLabel: total > 0 ? formatPercent(tag.count / total, language) : undefined,
  }))

  return (
    <ChartCard
      title={t("dashboard.tags.title")}
      description={t("dashboard.tags.description", { name: funnel.name })}
      className={className}
      actions={
        funnel.tags.length > TAGS_VISIBLE ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAll}
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? t("dashboard.tags.showLess") : t("dashboard.tags.showAll", { count: funnel.tags.length })}
          </Button>
        ) : undefined
      }
    >
      {items.length ? (
        <RankedBars items={items} />
      ) : (
        <CardEmpty title={t("dashboard.tags.emptyTitle")} description={t("dashboard.tags.emptyHint")} />
      )}
    </ChartCard>
  )
}
