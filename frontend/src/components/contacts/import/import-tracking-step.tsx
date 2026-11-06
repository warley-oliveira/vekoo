import { useTranslation } from "react-i18next"
import { CircleCheck, Loader2, RefreshCw, TriangleAlert } from "lucide-react"

import { Callout } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useImportOutcome, type SendState } from "@/hooks/contacts/use-contact-imports"
import { contactErrorMessage } from "@/lib/contacts/error-message"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-medium tabular-nums">{value}</dd>
    </div>
  )
}

export type ImportTrackingStepProps = {
  send: SendState
  onResume: () => void
  ignored: number
}

/** Acompanhar e ver o resultado: é a mesma tela, porque é a mesma importação. */
export function ImportTrackingStep({ send, onResume, ignored }: ImportTrackingStepProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const outcome = useImportOutcome(send.importIds, send)
  const number = (value: number) => formatNumber(value, language)

  const sending = send.phase === "sending"
  const sendFailed = send.phase === "failed"
  const done = !sending && !sendFailed && !outcome.running

  let title: string
  let percentage: number | null

  if (sending) {
    title = t("contacts.import.tracking.sending", {
      sent: number(send.sentBatches),
      total: number(send.totalBatches),
    })
    percentage = send.totalBatches > 0 ? (send.sentBatches / send.totalBatches) * 100 : null
  } else if (outcome.running) {
    title =
      outcome.totalBatches > 1
        ? t("contacts.import.tracking.processingBatches", {
            finished: number(outcome.finishedBatches),
            total: number(outcome.totalBatches),
          })
        : t("contacts.import.tracking.processing")
    percentage =
      outcome.totalBatches > 1 ? (outcome.finishedBatches / outcome.totalBatches) * 100 : null
  } else if (outcome.failedBatches > 0) {
    title = t("contacts.import.tracking.partial")
    percentage = 100
  } else {
    title = t("contacts.import.tracking.done")
    percentage = 100
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 rounded-lg border p-4">
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          {done && outcome.failedBatches === 0 ? (
            <CircleCheck aria-hidden className="size-4 shrink-0 text-status-success" />
          ) : done || sendFailed ? (
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-status-warning" />
          ) : (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {sendFailed ? t("contacts.import.tracking.sendFailed") : title}
        </p>
        {/* Com um lote só não há o que medir: o giro já diz que está andando. */}
        {sendFailed || percentage === null ? null : (
          <Progress
            value={percentage}
            aria-label={t("contacts.import.tracking.progressLabel")}
            className="gap-0"
          />
        )}
      </div>

      {sendFailed ? (
        <Callout
          tone="danger"
          role="alert"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={onResume}
            >
              <RefreshCw />
              {t("contacts.import.tracking.resume")}
            </Button>
          }
        >
          {t("contacts.import.tracking.sendFailedHint", {
            error: contactErrorMessage(t, send.error),
            sent: number(send.sentBatches),
            total: number(send.totalBatches),
          })}
        </Callout>
      ) : null}

      {send.importIds.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2">
          {/* Antes de terminar, o número é o que foi lido das linhas, e não as conversas criadas. */}
          <Stat
            label={t(done ? "contacts.import.tracking.imported" : "contacts.import.tracking.sent")}
            value={number(outcome.imported)}
          />
          <Stat
            label={t("contacts.import.tracking.notImported")}
            value={number(outcome.errors + ignored)}
          />
        </dl>
      ) : null}

      {outcome.failedBatches > 0 ? (
        <Callout tone="warning">{t("contacts.import.tracking.batchesFailed", { count: outcome.failedBatches })}</Callout>
      ) : null}

      {!done && !sendFailed && !sending ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("contacts.import.tracking.canClose")}
        </p>
      ) : null}
      {done ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("contacts.import.tracking.doneHint")}
        </p>
      ) : null}
    </div>
  )
}
