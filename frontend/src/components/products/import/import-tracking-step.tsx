import { useTranslation } from "react-i18next"
import { CheckCircle2, CircleAlert, Hourglass, TriangleAlert, UploadCloud } from "lucide-react"

import { DetailSkeleton, ErrorState, RelativeTime } from "@/components/shared"
import { Progress } from "@/components/ui/progress"
import {
  isImportAbandoned,
  isImportRunning,
  useProductImport,
  type ImportFeed,
  type ImportLive,
} from "@/hooks/products/use-product-imports"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { ProductImport } from "@/lib/products/types"

type Progressed = Extract<ImportLive, { kind: "progress" | "completed" }>

/**
 * Junta a leitura e o canal, ficando com o que estiver mais adiante: a leitura pode vir de
 * antes do último aviso, e o aviso pode ter se perdido.
 */
function combine(entry: ProductImport, live: ImportLive | undefined) {
  const event: Progressed | undefined = live && live.kind !== "error" ? live : undefined
  const fresher = event && event.processed >= entry.processedRows
  return {
    processed: fresher ? event.processed : entry.processedRows,
    total: fresher ? event.total : entry.totalRows,
    created: fresher ? event.created : entry.createdCount,
    updated: fresher ? event.updated : entry.updatedCount,
    errors: fresher ? event.errors : entry.errorCount,
    percentage: fresher ? event.percentage : entry.percentage,
  }
}

type ImportTrackingStepProps = {
  importId: string
  feed: ImportFeed
}

/** Acompanhar e ver o resultado: é a mesma tela, porque é a mesma importação. */
export function ImportTrackingStep({ importId, feed }: ImportTrackingStepProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { entry, error, mutate } = useProductImport(importId, feed.connected)
  const live = feed.live[importId]

  if (error && !entry) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (!entry) return <DetailSkeleton rows={4} />

  const number = (value: number) => formatNumber(value, language)
  const progress = combine(entry, live)

  // O aviso de erro pode chegar antes de a leitura saber que falhou.
  const failed = entry.status === "failed" || live?.kind === "error"
  const running = !failed && isImportRunning(entry) && live?.kind !== "completed"
  const abandoned = !failed && isImportAbandoned(entry)
  const queued = running && entry.status === "ready" && !live

  if (abandoned) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-4 text-sm">
        <p className="font-medium">{t("products.import.tracking.abandonedTitle")}</p>
        <p className="text-pretty text-muted-foreground">
          {t("products.import.tracking.abandonedHint")}
        </p>
      </div>
    )
  }

  const icon = failed ? (
    <CircleAlert className="size-5 text-status-danger" />
  ) : running ? (
    queued ? (
      <Hourglass className="size-5 text-muted-foreground" />
    ) : (
      <UploadCloud className="size-5 text-primary" />
    )
  ) : progress.errors > 0 ? (
    <TriangleAlert className="size-5 text-status-warning" />
  ) : (
    <CheckCircle2 className="size-5 text-status-success" />
  )

  const titleKey = failed
    ? "failedTitle"
    : queued
      ? "queuedTitle"
      : running
        ? "runningTitle"
        : progress.errors > 0
          ? "doneWithErrorsTitle"
          : "doneTitle"

  // `importInterrupted` vem de uma varredura, sem idioma de requisição: traduz pelo código.
  const liveFailure = live?.kind === "error" ? live : null
  const lastSample = entry.errorSample?.at(-1)
  const failureMessage =
    liveFailure?.code === "importInterrupted"
      ? t("products.import.tracking.interrupted")
      : (liveFailure?.message ?? lastSample?.message ?? t("products.import.tracking.failedHint"))

  const samples = (entry.errorSample ?? []).filter((sample) => !failed || sample.line !== null)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 shrink-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1" role="status">
          <p className="text-sm font-medium">{t(`products.import.tracking.${titleKey}`)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.filename}
            {entry.completedAt ? (
              <>
                {" · "}
                <RelativeTime value={entry.completedAt} />
              </>
            ) : null}
          </p>
        </div>
      </div>

      {running ? (
        <div className="flex flex-col gap-1.5">
          <Progress
            value={Math.min(progress.percentage, 100)}
            aria-label={t("products.import.tracking.progressLabel")}
            className="gap-0"
          />
          <p className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
            <span>
              {progress.total > 0
                ? // É uma estimativa até o fim: linhas em branco contam nela.
                  t("products.import.tracking.rows", {
                    processed: number(progress.processed),
                    total: number(progress.total),
                  })
                : t("products.import.tracking.counting")}
            </span>
            <span>{t("products.import.tracking.percent", { value: Math.round(progress.percentage) })}</span>
          </p>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="rounded-lg bg-status-danger-soft px-3 py-2.5 text-sm text-status-danger">
          {failureMessage}
        </p>
      ) : null}

      <dl className="grid grid-cols-3 gap-2">
        <Stat label={t("products.import.tracking.created")} value={number(progress.created)} />
        <Stat label={t("products.import.tracking.updated")} value={number(progress.updated)} />
        <Stat label={t("products.import.tracking.withErrors")} value={number(progress.errors)} />
      </dl>

      {running ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("products.import.tracking.canClose")}
        </p>
      ) : null}

      {!running && samples.length > 0 ? (
        <section aria-labelledby="import-errors-title" className="flex flex-col gap-2">
          <h3 id="import-errors-title" className="text-sm font-medium">
            {t("products.import.tracking.errorsTitle")}
          </h3>
          {progress.errors > samples.length ? (
            <p className="text-xs text-muted-foreground">
              {t("products.import.tracking.errorsSampled", {
                shown: number(samples.length),
                total: number(progress.errors),
              })}
            </p>
          ) : null}
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {samples.map((sample, index) => (
              <li key={`${sample.line}-${index}`} className="flex gap-3 px-3 py-2">
                <span className="shrink-0 text-xs leading-5 text-muted-foreground tabular-nums">
                  {sample.line === null
                    ? t("products.import.tracking.noLine")
                    : t("products.import.tracking.line", { line: number(sample.line) })}
                </span>
                <span className="min-w-0 text-pretty">{sample.message}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-pretty text-muted-foreground">
            {t("products.import.tracking.errorsHint")}
          </p>
        </section>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-medium tabular-nums">{value}</dd>
    </div>
  )
}
