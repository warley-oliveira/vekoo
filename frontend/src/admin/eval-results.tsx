import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "@/lib/router"
import { ArrowLeft } from "lucide-react"

import { useEvalResults, useEvalRound, type EvalDecision, type EvalResults } from "@/admin/api"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// O resultado de uma rodada do teste lado a lado. Só aqui o braço de cada lado
// aparece — e só com a rodada inteira avaliada. A regra de decisão foi fixada
// antes de olhar (spec, "Fase 3 — plano aprovado") e aparece junto do número.

const DECISION_TONE: Record<EvalDecision, string> = {
  turnOn: "border-primary/40 bg-primary/5",
  adjust: "border-border bg-muted/50",
  keepOff: "border-destructive/40 bg-destructive/5",
  noSignal: "border-border",
}

export function EvalResultsPage() {
  const { t } = useTranslation()
  const { round } = useParams()
  const roundState = useEvalRound(round)
  const complete = Boolean(roundState.data && roundState.data.decided === roundState.data.total)
  const { data, error, mutate } = useEvalResults(round, complete)

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" render={<Link to="/admin/evals" />}>
        <ArrowLeft aria-hidden />
        {t("admin.evals.pair.rounds")}
      </Button>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.evals.results.title", { round })}</h1>
    </div>
  )

  if (roundState.error && !roundState.data) return <ErrorState error={roundState.error} onRetry={() => void roundState.mutate()} />
  if (roundState.data && !complete) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title={t("admin.evals.results.incomplete", { decided: roundState.data.decided, total: roundState.data.total })}
          description={t("admin.evals.results.incompleteHint")}
        />
        <Button render={<Link to={`/admin/evals/${round}`} />}>{t("admin.evals.continue")}</Button>
      </div>
    )
  }
  if (error && !data) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (!data) {
    return (
      <div className="space-y-6" aria-busy>
        {header}
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <Results data={data} />
    </div>
  )
}

function Results({ data }: { data: EvalResults }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const percent = (value: number | null) => (value === null ? "—" : `${formatNumber(Math.round(value * 100), language)}%`)
  const decimal = (value: number | null | undefined) => (value == null ? "—" : formatNumber(value, language))
  const dollars = (micro: number | undefined) => (micro == null ? "—" : `US$ ${formatNumber(Math.round(micro / 10_000) / 100, language)}`)

  return (
    <>
      <section className={cn("space-y-1 rounded-lg border p-4 sm:p-5", DECISION_TONE[data.decision])} aria-labelledby="eval-decision">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{t("admin.evals.results.decisionLabel")}</p>
        <h2 id="eval-decision" className="font-heading text-xl font-semibold">{t(`admin.evals.results.decision.${data.decision}`)}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.evals.results.rule")}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("admin.evals.results.winRate")} value={percent(data.main.winRate)}>
          {t("admin.evals.results.wins", { references: data.main.referencesWins, plain: data.main.plainWins, ties: data.main.ties })}
        </Tile>
        <Tile label={t("admin.evals.results.usable")} value={`${decimal(data.main.usable.references)} × ${decimal(data.main.usable.plain)}`}>
          {t("admin.evals.results.usableHint")}
        </Tile>
        <Tile label={t("admin.evals.results.controls")} value={`${data.controls.preferred}/${data.controls.pairs}`}>
          {t("admin.evals.results.controlsHint")}
        </Tile>
        <Tile label={t("admin.evals.results.copied")} value={String(data.copied.references)} alert={data.copied.references > 0}>
          {t("admin.evals.results.copiedHint", { plain: data.copied.plain })}
        </Tile>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("admin.evals.results.inBank")} value={percent(data.inBank.winRate)}>
          {t("admin.evals.results.pairs", { count: data.inBank.pairs })}
        </Tile>
        <Tile label={t("admin.evals.results.outOfBank")} value={percent(data.outOfBank.winRate)}>
          {t("admin.evals.results.pairs", { count: data.outOfBank.pairs })}
        </Tile>
        <Tile label={t("admin.evals.results.followed")} value={`${data.followed.withReference}/${data.followed.pieces}`}>
          {t("admin.evals.results.followedHint")}
        </Tile>
        <Tile label={t("admin.evals.results.cost")} value={`${dollars(data.costMicroUsd.references)} × ${dollars(data.costMicroUsd.plain)}`}>
          {t("admin.evals.results.costHint")}
        </Tile>
      </div>
    </>
  )
}

function Tile({ label, value, alert, children }: { label: string; value: string; alert?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-1 rounded-lg border p-4", alert && "border-destructive/50")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-heading text-2xl font-semibold tabular-nums", alert && "text-destructive")}>{value}</p>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  )
}
