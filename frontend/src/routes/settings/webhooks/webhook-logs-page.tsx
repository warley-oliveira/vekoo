import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router"
import { History, RefreshCw } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { formatMs, LogDetailPanel } from "@/components/webhooks/log-detail-panel"
import { LogStats } from "@/components/webhooks/log-stats"
import { LOG_STATUS_TONES } from "@/components/webhooks/webhook-status"
import { WebhooksNav } from "@/components/webhooks/webhooks-nav"
import {
  DataTable,
  DateRangePicker,
  FilterBar,
  PageBody,
  PageHeader,
  RelativeTime,
  SegmentedControl,
  SelectInput,
  StatusBadge,
  type DateRangeValue,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useWebhookLog, useWebhookLogs, useWebhookLogStats } from "@/hooks/webhooks/use-webhook-logs"
import { useWebhooks } from "@/hooks/webhooks/use-webhooks"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { LOG_STATUSES, type WebhookLog, type WebhookLogStatus } from "@/lib/webhooks/types"

// O histórico: cada requisição que chegou, dos últimos 90 dias. É a tela de quem está depurando, e por isso é tabela:
// aqui se comparam códigos e tempos, linha a linha. Webhook e situação ficam no endereço, para dar para mandar o link.

const PERIODS = ["7", "30", "90"] as const
type StatsPeriod = (typeof PERIODS)[number]
const DEFAULT_PER_PAGE = 50

export default function WebhookLogsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const { webhooks } = useWebhooks()

  const webhookId = searchParams.get("webhook")
  const statusParam = searchParams.get("status")
  const status = LOG_STATUSES.includes(statusParam as WebhookLogStatus) ? (statusParam as WebhookLogStatus) : null
  const selectedLogId = searchParams.get("log")

  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("30")
  const [range, setRange] = useState<DateRangeValue | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE)

  const setParam = (name: string, value: string | null) =>
    setSearchParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (value) copy.set(name, value)
        else copy.delete(name)
        return copy
      },
      { replace: true }
    )

  const changeFilter = (name: string, value: string | null) => {
    setPage(1)
    setParam(name, value)
  }

  const { logs, meta, error, isLoading, isValidating, reload } = useWebhookLogs({
    webhookId,
    status,
    from: range?.from ?? null,
    to: range?.to ?? null,
    page,
    perPage,
  })
  const stats = useWebhookLogStats(webhookId, Number(statsPeriod))

  const panelOpen = Boolean(selectedLogId)
  const panelKey = useOpenCount(panelOpen)
  const known = logs.find((log) => log.id === selectedLogId) ?? null
  const detail = useWebhookLog(selectedLogId, known)
  const shownLog = useRetained(detail.log)

  const columns = useMemo<ColumnDef<WebhookLog, unknown>[]>(
    () => [
      {
        id: "status",
        accessorKey: "status",
        header: t("webhooks.logs.columns.status"),
        enableSorting: false,
        meta: { mobile: "secondary", className: "w-32" },
        cell: ({ row }) => (
          <StatusBadge tone={LOG_STATUS_TONES[row.original.status]}>{t(`webhooks.logs.status.${row.original.status}`)}</StatusBadge>
        ),
      },
      {
        id: "webhookName",
        accessorKey: "webhookName",
        header: t("webhooks.logs.columns.webhook"),
        enableSorting: false,
        meta: { mobile: "primary", className: "min-w-48" },
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium">{row.original.webhookName}</span>
            {row.original.errorMessage ? (
              <span className="block max-w-md truncate text-xs text-status-danger">{row.original.errorMessage}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: "statusCode",
        accessorKey: "statusCode",
        header: t("webhooks.logs.columns.code"),
        enableSorting: false,
        meta: { className: "w-20", align: "right" },
        cell: ({ row }) => <span className="font-mono text-xs tabular-nums">{row.original.statusCode ?? t("webhooks.common.none")}</span>,
      },
      {
        id: "requestIp",
        accessorKey: "requestIp",
        header: t("webhooks.logs.columns.ip"),
        enableSorting: false,
        meta: { className: "w-36" },
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.requestIp ?? t("webhooks.common.none")}</span>,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: t("webhooks.logs.columns.when"),
        enableSorting: false,
        meta: { className: "w-36" },
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} className="text-sm text-muted-foreground" />,
      },
      {
        id: "processingTimeMs",
        accessorKey: "processingTimeMs",
        header: t("webhooks.logs.columns.duration"),
        enableSorting: false,
        meta: { className: "w-24", align: "right" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground tabular-nums">{formatMs(row.original.processingTimeMs, language) ?? t("webhooks.common.none")}</span>
        ),
      },
    ],
    [language, t]
  )

  const webhookOptions = useMemo(
    () => webhooks.map((webhook) => ({ value: webhook.id, label: webhook.name })),
    [webhooks]
  )

  const isFiltered = Boolean(webhookId) || Boolean(status) || Boolean(range)
  const clearFilters = () => {
    setPage(1)
    setRange(null)
    setSearchParams(
      (current) => {
        const copy = new URLSearchParams(current)
        copy.delete("webhook")
        copy.delete("status")
        return copy
      },
      { replace: true }
    )
  }

  const refreshing = isValidating && Boolean(meta)

  return (
    <PageBody variant="wide">
      <PageHeader
        description={t("webhooks.logs.description")}
        mobilePlacement="inline"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("webhooks.logs.refresh")}
            disabled={refreshing}
            className="pointer-coarse:size-10"
            onClick={() => {
              void reload()
              void stats.reload()
            }}
          >
            <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
          </Button>
        }
      />
      <WebhooksNav />

      <section aria-label={t("webhooks.logs.stats.label")} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">
            {webhookId ? t("webhooks.logs.stats.titleWebhook", { name: webhooks.find((item) => item.id === webhookId)?.name ?? "" }) : t("webhooks.logs.stats.title")}
          </h2>
          <SegmentedControl
            aria-label={t("webhooks.logs.stats.periodLabel")}
            value={statsPeriod}
            onChange={setStatsPeriod}
            options={PERIODS.map((value) => ({ value, label: t("webhooks.logs.stats.days", { count: Number(value) }) }))}
          />
        </div>
        <LogStats stats={stats.stats} loading={stats.isLoading} onRetry={() => void stats.reload()} />
      </section>

      <section aria-label={t("webhooks.logs.listLabel")} className="flex flex-col gap-4">
        <FilterBar
          activeCount={(webhookId ? 1 : 0) + (status ? 1 : 0) + (range ? 1 : 0)}
          onClear={clearFilters}
          resultLabel={meta ? t("webhooks.logs.count", { count: meta.total }) : undefined}
          filters={
            <>
              <SelectInput
                aria-label={t("webhooks.logs.webhookFilter")}
                value={webhookId}
                options={webhookOptions}
                clearLabel={t("webhooks.logs.allWebhooks")}
                placeholder={t("webhooks.logs.allWebhooks")}
                className="md:w-64"
                onChange={(next) => changeFilter("webhook", next)}
              />
              <SelectInput
                aria-label={t("webhooks.logs.statusFilter")}
                value={status}
                options={LOG_STATUSES.map((value) => ({ value, label: t(`webhooks.logs.status.${value}`) }))}
                clearLabel={t("webhooks.logs.allStatuses")}
                placeholder={t("webhooks.logs.allStatuses")}
                className="md:w-44"
                onChange={(next) => changeFilter("status", next)}
              />
              <DateRangePicker
                label={t("webhooks.logs.period")}
                value={range}
                className="md:w-56"
                onChange={(next) => {
                  setPage(1)
                  setRange(next)
                }}
              />
            </>
          }
        />

        <DataTable
          aria-label={t("webhooks.logs.listLabel")}
          columns={columns}
          data={logs}
          getRowId={(log) => log.id}
          meta={meta}
          isLoading={isLoading && !meta}
          isFetching={refreshing}
          error={meta ? undefined : error}
          onRetry={() => void reload()}
          onPageChange={setPage}
          onPerPageChange={(next) => {
            setPerPage(next)
            setPage(1)
          }}
          perPageOptions={[25, 50, 100]}
          density={isMobile ? undefined : "compact"}
          onRowClick={(log) => setParam("log", log.id)}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          empty={{
            icon: <History className="size-5" />,
            title: t("webhooks.logs.emptyTitle"),
            description: t("webhooks.logs.emptyDescription"),
            action: { label: t("webhooks.logs.emptyAction"), onClick: () => navigate("/settings/webhooks") },
          }}
        />
      </section>

      {selectedLogId || shownLog ? (
        <LogDetailPanel
          key={panelKey}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) setParam("log", null)
          }}
          log={detail.log ?? shownLog}
          isLoading={detail.isLoading}
          error={detail.error}
          onRetry={() => void detail.reload()}
        />
      ) : null}
    </PageBody>
  )
}
