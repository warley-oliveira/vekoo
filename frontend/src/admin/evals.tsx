import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Scale } from "lucide-react"

import { useEvalRounds } from "@/admin/api"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"

// O teste lado a lado da Fase 3: as rodadas e o andamento de cada uma. A rodada
// nasce no terminal (`bin/rails references:eval:run`) e se avalia aqui, par a
// par, às cegas.

export function EvalRoundsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { data, error, isLoading, mutate } = useEvalRounds()

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.evals.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.evals.description")}</p>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={() => void mutate()} />
      ) : isLoading || !data ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : data.rounds.length === 0 ? (
        <EmptyState icon={<Scale className="size-6" />} title={t("admin.evals.empty.title")} description={t("admin.evals.empty.description")} />
      ) : (
        <ul className="space-y-3">
          {data.rounds.map((round) => {
            const complete = round.decided === round.total
            return (
              <li key={round.round} className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-medium">{t("admin.evals.round", { round: round.round })}</h2>
                    <span className="text-xs text-muted-foreground">{formatRelative(round.createdAt, language)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={(round.decided / round.total) * 100} className="max-w-xs" aria-label={t("admin.evals.progress", { decided: round.decided, total: round.total })} />
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {t("admin.evals.progress", { decided: round.decided, total: round.total })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {complete ? (
                    <Button size="sm" render={<Link to={`/admin/evals/${round.round}/results`} />}>
                      {t("admin.evals.seeResults")}
                    </Button>
                  ) : (
                    <Button size="sm" render={<Link to={`/admin/evals/${round.round}`} />}>
                      {round.decided === 0 ? t("admin.evals.start") : t("admin.evals.continue")}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
