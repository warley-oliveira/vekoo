import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ChevronDown } from "lucide-react"

import { Money, SectionCard } from "@/components/shared"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useLanguage } from "@/lib/i18n"
import { formatMonthTitle } from "@/lib/pipelines-admin/format"
import type { Board, BoardCard } from "@/lib/pipelines-admin/types"

const NO_DATE = "no-date"
/** A API conta sem probabilidade como 50%, e a soma aqui precisa bater com a dela. */
const DEFAULT_PROBABILITY = 50

type Bucket = {
  key: string
  label: string
  cards: BoardCard[]
  total: number
  weighted: number
}

/** Os negócios abertos pelo mês em que devem fechar, e os que ainda não têm previsão. */
export function ForecastList({ board }: { board: Board }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const buckets = useMemo<Bucket[]>(() => {
    const open = board.stages
      .flatMap((stage) => stage.cards)
      .filter((card) => !card.wonAt && !card.lostAt && card.dealValue !== null)

    const byMonth = new Map<string, BoardCard[]>()
    for (const card of open) {
      const key = card.expectedCloseDate?.slice(0, 7) ?? NO_DATE
      byMonth.set(key, [...(byMonth.get(key) ?? []), card])
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : a.localeCompare(b)))
      .map(([key, cards]) => ({
        key,
        label: key === NO_DATE ? t("pipelinesAdmin.metrics.forecast.noDate") : formatMonthTitle(key, language),
        cards,
        total: cards.reduce((sum, card) => sum + (card.dealValue ?? 0), 0),
        weighted: cards.reduce(
          (sum, card) => sum + ((card.dealValue ?? 0) * (card.dealProbability ?? DEFAULT_PROBABILITY)) / 100,
          0
        ),
      }))
  }, [board.stages, language, t])

  const top = Math.max(...buckets.map((bucket) => bucket.total), 0)

  return (
    <SectionCard
      title={t("pipelinesAdmin.metrics.forecast.title")}
      description={t("pipelinesAdmin.metrics.forecast.description")}
    >
      {buckets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.metrics.forecast.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {buckets.map((bucket) => (
            <li key={bucket.key}>
              <Collapsible>
                <CollapsibleTrigger
                  render={
                    <button
                      type="button"
                      className="group flex w-full flex-col gap-1 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  }
                >
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ChevronDown
                        aria-hidden
                        className="size-3.5 shrink-0 self-center text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
                      />
                      <span className="truncate font-medium">{bucket.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("pipelinesAdmin.metrics.forecast.count", { count: bucket.cards.length })}
                      </span>
                    </span>
                    <Money value={bucket.total} className="shrink-0 font-medium" />
                  </span>
                  <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full origin-left rounded-full bg-chart-2 motion-safe:transition-transform motion-safe:duration-300"
                      style={{ transform: `scaleX(${top > 0 ? bucket.total / top : 0})` }}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("pipelinesAdmin.metrics.forecast.weighted")} <Money value={bucket.weighted} />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="flex flex-col gap-1 pb-3 pl-5">
                    {bucket.cards.map((card) => (
                      <li key={card.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <Link
                          to={`/pipelines/${board.id}/board?card=${card.id}`}
                          className="min-w-0 truncate rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {card.companyName || card.title}
                        </Link>
                        <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted-foreground">
                          {card.dealProbability !== null ? (
                            <span className="tabular-nums">{card.dealProbability}%</span>
                          ) : null}
                          <Money value={card.dealValue} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
