import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router"
import { History, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Webhook as WebhookIcon } from "lucide-react"
import { toast } from "sonner"

import { WebhookAlertNotice } from "@/components/webhooks/webhook-alert"
import { WebhookNameDialog } from "@/components/webhooks/webhook-name-dialog"
import { WEBHOOK_STATUS_TONES } from "@/components/webhooks/webhook-status"
import { WebhooksNav } from "@/components/webhooks/webhooks-nav"
import { WebhookListSkeleton } from "@/components/webhooks/webhooks-skeletons"
import {
  ActionsMenu,
  CopyButton,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  PageBody,
  PageHeader,
  RelativeTime,
  SortMenu,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useWebhookAlerts, useWebhookMutations, useWebhooks } from "@/hooks/webhooks/use-webhooks"
import { useOpenCount } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { webhookAddress } from "@/lib/webhooks/send-test"
import { ACTION_TYPES, WEBHOOK_STATUSES, type Webhook, type WebhookAlert } from "@/lib/webhooks/types"

// Os webhooks: endereços que outros sistemas chamam para avisar de alguma coisa. Lista, e não cartões: o que se compara
// aqui é o estado e o uso, e o endereço para copiar precisa de largura.

type SortKey = "recent" | "name" | "used"

const ALERT_FILTER = "with-alert"

export default function WebhooksPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const navigate = useNavigate()
  const { webhooks, hasData, error, isLoading, isValidating, reload } = useWebhooks()
  const alerts = useWebhookAlerts()
  const { createWebhook } = useWebhookMutations()

  const [query, setQuery] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>("recent")
  const [creating, setCreating] = useState(false)
  const createKey = useOpenCount(creating)

  const knownIds = useMemo(() => new Set(webhooks.map((webhook) => webhook.id)), [webhooks])

  // Aviso de um webhook que não está na lista: ele aparece mesmo assim, porque é o que o número do menu conta, e sumir com
  // ele deixaria um "1" no menu sem nada na tela para explicar.
  const orphanAlerts = alerts.alerts.filter((alert) => !knownIds.has(alert.originId))

  const statusOptions = useMemo(() => {
    const withAlerts = webhooks.filter((webhook) => alerts.byWebhook.has(webhook.id)).length
    return [
      ...WEBHOOK_STATUSES.map((status) => ({
        value: status as string,
        label: t(`webhooks.status.${status}`),
        count: webhooks.filter((webhook) => webhook.status === status).length,
      })),
      ...(withAlerts > 0 ? [{ value: ALERT_FILTER, label: t("webhooks.list.withAlert"), count: withAlerts }] : []),
    ]
  }, [alerts.byWebhook, t, webhooks])

  const visible = useMemo(() => {
    const filtered = webhooks.filter((webhook) => {
      if (statuses.length > 0) {
        const hit = statuses.includes(webhook.status) || (statuses.includes(ALERT_FILTER) && alerts.byWebhook.has(webhook.id))
        if (!hit) return false
      }
      return !query || matchesSearch(`${webhook.name} ${webhook.slug} ${webhook.uid}`, query)
    })
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, language)
      if (sort === "used") return b.totalRequest - a.totalRequest
      return b.createdAt - a.createdAt
    })
  }, [alerts.byWebhook, language, query, sort, statuses, webhooks])

  const clearFilters = () => {
    setQuery("")
    setStatuses([])
  }

  const create = async (name: string) => {
    const webhook = await createWebhook(name)
    toast.success(t("webhooks.list.created"))
    navigate(`/settings/webhooks/${webhook.id}`)
  }

  const refreshing = isValidating && hasData

  return (
    <PageBody>
      <PageHeader
        description={t("webhooks.list.description")}
        mobilePlacement="inline"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("webhooks.list.refresh")}
              disabled={refreshing}
              className="pointer-coarse:size-10"
              onClick={() => {
                void reload()
                void alerts.reload()
              }}
            >
              <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
            </Button>
            <Button className="pointer-coarse:h-10" onClick={() => setCreating(true)}>
              <Plus />
              <span className="max-md:sr-only">{t("webhooks.list.create")}</span>
              <span className="md:hidden">{t("webhooks.list.createShort")}</span>
            </Button>
          </div>
        }
      />
      <WebhooksNav />

      {error && !hasData ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading && !hasData ? (
        <WebhookListSkeleton />
      ) : webhooks.length === 0 && orphanAlerts.length === 0 ? (
        <EmptyState
          icon={<WebhookIcon className="size-5" />}
          title={t("webhooks.list.emptyTitle")}
          description={t("webhooks.list.emptyDescription")}
          action={{ label: t("webhooks.list.create"), onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {orphanAlerts.map((alert) => (
            <WebhookAlertNotice key={alert.id} alert={alert} showName />
          ))}

          {webhooks.length > 0 ? (
            <FilterBar
              search={{ value: query, onChange: setQuery, debounce: 0, placeholder: t("webhooks.list.search") }}
              activeCount={statuses.length ? 1 : 0}
              onClear={clearFilters}
              resultLabel={t("webhooks.list.count", { count: visible.length })}
              sort={
                <SortMenu
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "recent", label: t("webhooks.list.sortRecent") },
                    { value: "name", label: t("webhooks.list.sortName") },
                    { value: "used", label: t("webhooks.list.sortUsed") },
                  ]}
                />
              }
              filters={<FacetedFilter title={t("webhooks.list.statusFilter")} options={statusOptions} value={statuses} onChange={setStatuses} />}
            />
          ) : null}

          {webhooks.length > 0 && visible.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title={t("webhooks.list.noResultsTitle")}
              description={t("webhooks.list.noResultsDescription")}
              action={{ label: t("webhooks.common.clearFilters"), onClick: clearFilters }}
            />
          ) : visible.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
              <AnimatePresence initial={false}>
                {visible.map((webhook) => (
                  <motion.li key={webhook.id} {...preset.listItem} className="min-w-0">
                    <WebhookRow webhook={webhook} alerts={alerts.byWebhook.get(webhook.id)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : null}
        </div>
      )}

      <WebhookNameDialog
        key={createKey}
        open={creating}
        onOpenChange={setCreating}
        title={t("webhooks.list.createTitle")}
        description={t("webhooks.list.createDescription")}
        submitLabel={t("webhooks.list.create")}
        onSubmit={create}
      />
    </PageBody>
  )
}

function WebhookRow({ webhook, alerts }: { webhook: Webhook; alerts?: WebhookAlert[] }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { setStatus, deleteWebhook } = useWebhookMutations()
  const [switching, setSwitching] = useState(false)

  const path = `/settings/webhooks/${webhook.id}`
  const address = webhookAddress(webhook.url)
  const active = webhook.status === "active"
  const contact = webhook.webhookActions.find((action) => action.type === ACTION_TYPES.contact)
  const canActivate = Boolean(contact?.config.contactIdentifier?.trim())
  // A ação do contato é fixa: a contagem é do que a pessoa escolheu acrescentar.
  const extraActions = webhook.webhookActions.filter((action) => action.type !== ACTION_TYPES.contact).length

  const toggle = async () => {
    if (!active && !canActivate) {
      toast.error(t("webhooks.mode.needsContact"), {
        action: { label: t("webhooks.mode.needsContactAction"), onClick: () => navigate(path) },
      })
      return
    }
    setSwitching(true)
    try {
      await setStatus(webhook.id, active ? "test" : "active")
      toast.success(t(active ? "webhooks.mode.nowTest" : "webhooks.mode.nowActive", { name: webhook.name }))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("webhooks.common.actionFailed"))
    } finally {
      setSwitching(false)
    }
  }

  const remove = async () => {
    const confirmed = await confirm({
      title: t("webhooks.delete.title", { name: webhook.name }),
      description: t("webhooks.delete.description"),
      confirmLabel: t("webhooks.delete.action"),
      destructive: true,
      onConfirm: () => deleteWebhook(webhook.id),
    })
    if (confirmed) toast.success(t("webhooks.delete.done", { name: webhook.name }))
  }

  const switchLabel = t(active ? "webhooks.list.switchToTest" : "webhooks.list.switchToActive", { name: webhook.name })

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              to={path}
              className="pointer-coarse:-my-2.5 pointer-coarse:py-2.5 truncate rounded text-sm font-semibold tracking-tight hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {webhook.name}
            </Link>
            <StatusBadge tone={WEBHOOK_STATUS_TONES[webhook.status]}>{t(`webhooks.status.${webhook.status}`)}</StatusBadge>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
            <code className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={address}>
              {address}
            </code>
            <CopyButton value={address} aria-label={t("webhooks.list.copyUrl", { name: webhook.name })} className="size-6 shrink-0 text-muted-foreground pointer-coarse:size-10" />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{t("webhooks.list.requests", { count: webhook.totalRequest, formatted: formatNumber(webhook.totalRequest, language) })}</span>
            <span aria-hidden>·</span>
            <span>{t("webhooks.list.actions", { count: extraActions })}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              {t("webhooks.list.createdAt")} <RelativeTime value={webhook.createdAt} />
            </span>
            {webhook.signatureEnabled ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3" aria-hidden />
                  {t("webhooks.list.signed")}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <span className="mt-0.5 flex shrink-0 items-center">
                <Switch checked={active} disabled={switching} aria-label={switchLabel} onCheckedChange={() => void toggle()} />
              </span>
            }
          />
          <TooltipContent side="top">{switchLabel}</TooltipContent>
        </Tooltip>

        <ActionsMenu
          className="-mt-0.5 shrink-0 pointer-coarse:size-10"
          label={t("webhooks.list.actionsOf", { name: webhook.name })}
          actions={[
            { label: t("webhooks.list.edit"), icon: <Pencil />, onSelect: () => navigate(path) },
            { label: t("webhooks.list.logs"), icon: <History />, onSelect: () => navigate(`/settings/webhooks/logs?webhook=${webhook.id}`) },
            { label: t("webhooks.delete.action"), icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => void remove() },
          ]}
        />
      </div>

      {alerts?.map((alert) => <WebhookAlertNotice key={alert.id} alert={alert} />)}
    </div>
  )
}
