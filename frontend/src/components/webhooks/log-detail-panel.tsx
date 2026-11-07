import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ChevronRight, CircleAlert, ExternalLink } from "lucide-react"

import { Callout, CopyButton, DetailSkeleton, ErrorState, KeyValueList, SidePanel, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { formatFullDateTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { WebhookLog } from "@/lib/webhooks/types"

import { LOG_STATUS_TONES, WEBHOOK_STATUS_TONES } from "./webhook-status"

// Uma requisição, para depurar: o que entrou, como veio, e o que a plataforma fez com aquilo. Abre no corpo, que é o que
// quase sempre se procura; cabeçalhos e parâmetros ficam a um clique.

export function formatMs(value: number | null | undefined, language: string) {
  return value === null || value === undefined ? null : `${formatNumber(Math.round(value), language)} ms`
}

function isEmpty(value: Record<string, unknown> | null | undefined) {
  return !value || Object.keys(value).length === 0
}

export function LogDetailPanel({
  open,
  onOpenChange,
  log,
  isLoading,
  error,
  onRetry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  log: WebhookLog | null
  isLoading: boolean
  error: unknown
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={log?.webhookName ?? t("webhooks.logs.detailTitle")}
      description={log ? formatFullDateTime(log.createdAt, language) : undefined}
      footer={
        log ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={`/settings/webhooks/${log.webhookId}`} />}
            className="pointer-coarse:h-10"
          >
            <ExternalLink />
            {t("webhooks.logs.openWebhook")}
          </Button>
        ) : undefined
      }
    >
      {log ? (
        <LogDetail log={log} />
      ) : isLoading ? (
        <DetailSkeleton rows={6} />
      ) : (
        <ErrorState error={error} onRetry={onRetry} />
      )}
    </SidePanel>
  )
}

function LogDetail({ log }: { log: WebhookLog }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const truncated = (log.requestBody as { _truncated?: unknown } | null)?._truncated === true
  const nothing = isEmpty(log.requestHeaders) && isEmpty(log.requestBody) && isEmpty(log.requestQuery)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("webhooks.logs.outcome")}</h3>
        <p className="text-sm text-pretty text-muted-foreground">{t(outcomeKey(log), { code: log.statusCode })}</p>
        {log.errorMessage ? (
          <Callout tone="danger" icon={<CircleAlert />}>
            <span className="break-words">{log.errorMessage}</span>
          </Callout>
        ) : null}
        <KeyValueList
          items={[
            {
              label: t("webhooks.logs.columns.status"),
              value: <StatusBadge tone={LOG_STATUS_TONES[log.status]}>{t(`webhooks.logs.status.${log.status}`)}</StatusBadge>,
            },
            { label: t("webhooks.logs.statusCode"), value: log.statusCode },
            { label: t("webhooks.logs.columns.duration"), value: formatMs(log.processingTimeMs, language) },
            {
              label: t("webhooks.logs.modeAtTheTime"),
              value: log.webhookStatus ? (
                <StatusBadge tone={WEBHOOK_STATUS_TONES[log.webhookStatus]}>{t(`webhooks.status.${log.webhookStatus}`)}</StatusBadge>
              ) : null,
            },
            { label: t("webhooks.logs.method"), value: log.requestMethod },
            { label: t("webhooks.logs.columns.ip"), value: log.requestIp },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("webhooks.logs.received")}</h3>
        {nothing ? <p className="text-sm text-muted-foreground">{t("webhooks.logs.nothingReceived")}</p> : null}
        {truncated ? <Callout>{t("webhooks.logs.truncated")}</Callout> : null}
        {!isEmpty(log.requestBody) ? <JsonSection title={t("webhooks.logs.body")} value={log.requestBody} defaultOpen /> : null}
        {!isEmpty(log.requestQuery) ? <JsonSection title={t("webhooks.logs.query")} value={log.requestQuery} /> : null}
        {!isEmpty(log.requestHeaders) ? (
          <JsonSection title={t("webhooks.logs.headers")} hint={t("webhooks.logs.headersHint")} value={log.requestHeaders} />
        ) : null}
      </section>
    </div>
  )
}

/** A frase que resume o que aconteceu: o código sozinho não diz se as ações rodaram. */
function outcomeKey(log: WebhookLog) {
  if (log.status === "skipped") return "webhooks.logs.outcomes.skipped"
  if (log.status === "error") {
    return log.statusCode === 401 ? "webhooks.logs.outcomes.refused" : "webhooks.logs.outcomes.failed"
  }
  return log.webhookStatus === "test" ? "webhooks.logs.outcomes.captured" : "webhooks.logs.outcomes.ran"
}

function JsonSection({
  title,
  hint,
  value,
  defaultOpen = false,
}: {
  title: string
  hint?: string
  value: Record<string, unknown>
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const text = JSON.stringify(value, null, 2)

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded px-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
          {title}
          <span className="text-xs font-normal text-muted-foreground">{t("webhooks.logs.fieldCount", { count: Object.keys(value).length })}</span>
        </button>
        <CopyButton value={text} aria-label={t("webhooks.logs.copy", { name: title })} className="shrink-0 pointer-coarse:size-10" />
      </div>
      {open ? (
        <div className="border-t bg-muted/30">
          {hint ? <p className="px-3 pt-2 text-xs text-pretty text-muted-foreground">{hint}</p> : null}
          <pre className="max-h-96 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</pre>
        </div>
      ) : null}
    </div>
  )
}
