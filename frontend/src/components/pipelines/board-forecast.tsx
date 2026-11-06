import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { CalendarSearch } from "lucide-react"

import { EmptyState, Money } from "@/components/shared"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { useLanguage } from "@/lib/i18n"
import { capitalizeFirstLetter } from "@/lib/date-format"
import { parseDayKey } from "@/lib/pipelines/card-meta"
import type { Card, StageWithCards } from "@/lib/pipelines/types"

type Bucket = {
  key: string
  label: string
  cards: Card[]
  total: number
  weighted: number
}

const NO_DATE = "no-date"

/**
 * Os negócios abertos por mês de fechamento previsto: quanto entra e quando. Segue o filtro da barra,
 * porque conta o que está na tela.
 */
export const BoardForecast = memo(function BoardForecast({ stages }: { stages: StageWithCards[] }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const actions = useCardActions()

  const buckets = useMemo<Bucket[]>(() => {
    const months = new Map<string, Bucket>()
    const noDate: Bucket = {
      key: NO_DATE,
      label: t("pipelines.forecast.noDate"),
      cards: [],
      total: 0,
      weighted: 0,
    }
    const monthFormat = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" })

    for (const stage of stages) {
      for (const card of stage.cards) {
        if (card.wonAt || card.lostAt) continue

        let bucket = noDate
        if (card.expectedCloseDate) {
          const key = card.expectedCloseDate.slice(0, 7)
          bucket =
            months.get(key) ??
            ({
              key,
              label: capitalizeFirstLetter(monthFormat.format(parseDayKey(card.expectedCloseDate))),
              cards: [],
              total: 0,
              weighted: 0,
            } satisfies Bucket)
          months.set(key, bucket)
        }

        const value = card.dealValue ?? 0
        bucket.cards.push(card)
        bucket.total += value
        if (value && card.dealProbability) bucket.weighted += (value * card.dealProbability) / 100
      }
    }

    const sorted = [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
    return noDate.cards.length > 0 ? [...sorted, noDate] : sorted
  }, [language, stages, t])

  const maxTotal = useMemo(() => Math.max(...buckets.map((bucket) => bucket.total), 1), [buckets])

  if (buckets.length === 0) {
    return (
      <div className="px-4 pb-6 md:px-6">
        <EmptyState
          icon={<CalendarSearch className="size-5" />}
          title={t("pipelines.forecast.empty")}
          description={t("pipelines.forecast.emptyHint")}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+var(--app-bottom-nav-total))] md:px-6">
      {buckets.map((bucket) => (
        <section key={bucket.key} aria-label={bucket.label} className="flex max-w-4xl flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <h3 className="font-heading text-base font-semibold tracking-tight">
              {bucket.label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("pipelines.forecast.count", { count: bucket.cards.length })}
              </span>
            </h3>
            <p className="flex items-baseline gap-3 text-sm">
              <span className="text-xs text-muted-foreground">{t("pipelines.forecast.total")}</span>
              <Money value={bucket.total} className="font-medium" />
              <span className="text-xs text-muted-foreground">{t("pipelines.forecast.weighted")}</span>
              <Money value={bucket.weighted} className="font-medium text-primary" />
            </p>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full origin-left rounded-full bg-primary transition-transform duration-300"
              style={{ transform: `scaleX(${bucket.total / maxTotal})` }}
            />
          </div>

          <ul className="flex flex-col divide-y">
            {bucket.cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => actions.open(card.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{card.title}</span>
                    {card.companyName && card.companyName !== card.title ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {card.companyName}
                      </span>
                    ) : null}
                  </span>
                  {card.dealProbability !== null ? (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {card.dealProbability}%
                    </span>
                  ) : null}
                  <Money value={card.dealValue} className="shrink-0 text-sm font-medium" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
})
