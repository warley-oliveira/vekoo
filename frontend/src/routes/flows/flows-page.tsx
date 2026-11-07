import { memo, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Archive, Copy, ListChecks, Pencil, Plus, Power, Settings2, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CreateFlowDialog } from "@/components/flows/create-flow-dialog"
import { TemplateGallery } from "@/components/flows/template-gallery"
import { RunDots } from "@/components/flows/run-dots"
import { STATUS_TONES } from "@/components/flows/flow-status"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  ListSkeleton,
  PageBody,
  PageHeader,
  RelativeTime,
  SegmentedControl,
  SortMenu,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useFlowMutations, useFlows } from "@/hooks/flows/use-flows"
import { useCan } from "@/hooks/use-can"
import { useOpenCount } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import { FLOW_TRIGGER_TYPES, type FlowStatus, type FlowSummary, type FlowTemplate } from "@/lib/flows/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

// Os fluxos: quem cuida das conversas. Lista densa, porque o que se compara aqui é a situação e o uso, e não dá
// para uma tabela dizer "quando alguém manda a primeira mensagem" sem virar parede de texto.

type StatusTab = "active" | FlowStatus
type SortKey = "recent" | "name" | "used"

export default function FlowsPage() {
  const { t } = useTranslation()
  const { flows, hasData, error, isLoading, reload } = useFlows()
  const [params, setParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [createTab, setCreateTab] = useState<"template" | "blank">("template")
  const dialogKey = useOpenCount(createOpen)
  const [query, setQuery] = useState("")
  const [triggers, setTriggers] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>("recent")

  const tab = (params.get("status") as StatusTab | null) ?? "active"
  const setTab = (next: StatusTab) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (next === "active") copy.delete("status")
        else copy.set("status", next)
        return copy
      },
      { replace: true }
    )

  const counts = useMemo(() => {
    const byStatus = { draft: 0, published: 0, archived: 0 }
    flows.forEach((flow) => {
      byStatus[flow.status] += 1
    })
    return byStatus
  }, [flows])

  const visible = useMemo(() => {
    const filtered = flows.filter((flow) => {
      const inTab = tab === "active" ? flow.status !== "archived" : flow.status === tab
      if (!inTab) return false
      if (triggers.length > 0 && !triggers.includes(flow.triggerType)) return false
      return !query || matchesSearch(`${flow.name} ${flow.description ?? ""}`, query)
    })
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name)
      if (sort === "used") return (b.stats?.lastExecutedAt ?? 0) - (a.stats?.lastExecutedAt ?? 0)
      return b.updatedAt - a.updatedAt
    })
  }, [flows, query, sort, tab, triggers])

  const openCreate = useCallback((initial: "template" | "blank" = "template") => {
    setCreateTab(initial)
    setCreateOpen(true)
  }, [])

  const triggerOptions = useMemo(
    () =>
      FLOW_TRIGGER_TYPES.map((value) => ({
        value,
        label: t(`flows.triggers.${value}`),
        count: flows.filter((flow) => flow.triggerType === value).length,
      })),
    [flows, t]
  )
  const sortOptions = useMemo(
    () => [
      { value: "recent" as const, label: t("flows.list.sortRecent") },
      { value: "used" as const, label: t("flows.list.sortUsed") },
      { value: "name" as const, label: t("flows.list.sortName") },
    ],
    [t]
  )

  const header = (
    <PageHeader
      description={t("flows.list.description")}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/automation-settings" />}
            className="pointer-coarse:h-10"
          >
            <Settings2 />
            {t("flows.list.settings")}
          </Button>
          <Button size="sm" onClick={() => openCreate()} className="pointer-coarse:h-10">
            <Plus />
            {t("flows.list.create")}
          </Button>
        </>
      }
      mobileActions={
        <Button size="sm" onClick={() => openCreate()} aria-label={t("flows.list.create")} className="pointer-coarse:h-10">
          <Plus />
          {t("flows.list.createShort")}
        </Button>
      }
      mobilePlacement="inline"
    />
  )

  const dialog = <CreateFlowDialog key={dialogKey} open={createOpen} onOpenChange={setCreateOpen} initialTab={createTab} />

  if (error && !hasData) {
    return (
      <PageBody>
        {header}
        <ErrorState error={error} onRetry={() => void reload()} />
        {dialog}
      </PageBody>
    )
  }

  if (isLoading && !hasData) {
    return (
      <PageBody>
        {header}
        <ListSkeleton rows={6} />
        {dialog}
      </PageBody>
    )
  }

  if (flows.length === 0) {
    return (
      <PageBody>
        {header}
        <Welcome onBlank={() => openCreate("blank")} />
        {dialog}
      </PageBody>
    )
  }

  const filtering = Boolean(query) || triggers.length > 0

  return (
    <PageBody>
      {header}

      <div className="flex flex-col gap-3">
        <Link
          to="/automation-settings"
          className="flex items-center gap-1.5 self-start rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
        >
          <Settings2 className="size-4" aria-hidden />
          {t("flows.settings.title")}
        </Link>
        <SegmentedControl
          aria-label={t("flows.list.statusLabel")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: t("flows.list.tabActive"), count: counts.draft + counts.published },
            { value: "published", label: t("flows.list.tabPublished"), count: counts.published },
            { value: "draft", label: t("flows.list.tabDraft"), count: counts.draft },
            { value: "archived", label: t("flows.list.tabArchived"), count: counts.archived },
          ]}
        />
        <FilterBar
          search={{ value: query, onChange: setQuery, placeholder: t("flows.list.search") }}
          activeCount={triggers.length ? 1 : 0}
          onClear={() => setTriggers([])}
          resultLabel={t("flows.list.count", { count: visible.length })}
          sort={<SortMenu value={sort} onChange={setSort} options={sortOptions} />}
          filters={
            <FacetedFilter
              title={t("flows.list.triggerFilter")}
              options={triggerOptions}
              value={triggers}
              onChange={setTriggers}
            />
          }
        />
      </div>

      {visible.length === 0 ? (
        filtering ? (
          <EmptyState
            title={t("flows.list.noResults")}
            description={t("flows.list.noResultsHint")}
            action={{
              label: t("flows.list.clearFilters"),
              onClick: () => {
                setQuery("")
                setTriggers([])
              },
            }}
          />
        ) : (
          <EmptyState
            title={t(`flows.list.emptyTab.${tab}`)}
            action={{ label: t("flows.list.create"), onClick: () => openCreate() }}
          />
        )
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {visible.map((flow) => (
            <FlowRow key={flow.id} flow={flow} />
          ))}
        </ul>
      )}

      {dialog}
    </PageBody>
  )
}

/* ---------- Primeira vez ---------- */

function Welcome({ onBlank }: { onBlank: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createFlow } = useFlowMutations()
  const [busy, setBusy] = useState<string | null>(null)

  const fromTemplate = async (template: FlowTemplate) => {
    if (busy) return
    setBusy(template.slug)
    try {
      const flow = await createFlow({
        name: template.name,
        description: template.description,
        triggerType: template.triggerType,
        template: template.slug,
      })
      navigate(`/flows/${flow.id}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("flows.create.failed"))
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="size-4" aria-hidden />
          {t("flows.welcome.eyebrow")}
        </p>
        <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-balance">{t("flows.welcome.title")}</h2>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">{t("flows.welcome.description")}</p>
      </div>
      <TemplateGallery limit={3} onSelect={(template) => void fromTemplate(template)} />
      <div>
        <Button variant="outline" onClick={onBlank}>
          <Plus />
          {t("flows.welcome.blank")}
        </Button>
      </div>
    </section>
  )
}

/* ---------- Uma linha ---------- */

const FlowRow = memo(function FlowRow({ flow }: { flow: FlowSummary }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const canUse = useCan("flows")
  const { archiveFlow, unarchiveFlow, deleteFlow, duplicateFlow } = useFlowMutations()
  const [pending, setPending] = useState(false)

  const failed = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : t("flows.list.actionFailed"))

  const turnOn = async () => {
    setPending(true)
    try {
      const updated = await unarchiveFlow(flow.id)
      toast.success(updated.status === "published" ? t("flows.toggle.turnedOn", { name: flow.name }) : t("flows.list.restored"))
    } catch (error) {
      failed(error)
    } finally {
      setPending(false)
    }
  }

  const turnOff = async () => {
    const confirmed = await confirm({
      title: t("flows.toggle.confirmTitle", { name: flow.name }),
      description: t("flows.toggle.confirmDescription"),
      confirmLabel: t("flows.toggle.confirmAction"),
      destructive: true,
      onConfirm: () => archiveFlow(flow.id),
    })
    if (confirmed) {
      toast.success(t("flows.toggle.turnedOff", { name: flow.name }), {
        action: { label: t("flows.toolbar.undo"), onClick: () => void turnOn() },
      })
    }
  }

  const archiveDraft = async () => {
    const confirmed = await confirm({
      title: t("flows.list.archiveTitle", { name: flow.name }),
      description: t("flows.list.archiveDescription"),
      confirmLabel: t("flows.list.archiveAction"),
      onConfirm: () => archiveFlow(flow.id),
    })
    if (confirmed) toast.success(t("flows.list.archived", { name: flow.name }))
  }

  const remove = async () => {
    const confirmed = await confirm({
      title: t("flows.list.deleteTitle", { name: flow.name }),
      description: t("flows.list.deleteDescription"),
      confirmLabel: t("flows.list.deleteAction"),
      destructive: true,
      onConfirm: () => deleteFlow(flow.id),
    })
    if (confirmed) toast.success(t("flows.list.deleted", { name: flow.name }))
  }

  const duplicate = async () => {
    try {
      const copy = await duplicateFlow(flow.id, t("flows.list.copyName", { name: flow.name }))
      toast.success(t("flows.list.duplicated"), {
        action: { label: t("flows.list.open"), onClick: () => navigate(`/flows/${copy.id}`) },
      })
    } catch (error) {
      failed(error)
    }
  }

  const stats = flow.stats
  const archived = flow.status === "archived"
  const week = stats?.last7Days

  return (
    <li className={cn("flex items-start gap-3 px-3 py-3 sm:items-center sm:px-4", archived && "bg-muted/30")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link
            to={`/flows/${flow.id}`}
            className="truncate rounded text-sm font-semibold tracking-tight hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {flow.name}
          </Link>
          <StatusBadge tone={STATUS_TONES[flow.status]}>{t(`flows.status.${flow.status}`)}</StatusBadge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={flow.description ?? undefined}>
          {t(`flows.triggers.${flow.triggerType}`)}
          {flow.description ? ` · ${flow.description}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden">
          <FlowUsage flow={flow} />
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground sm:flex">
        <FlowUsage flow={flow} />
      </div>

      {week && week.waiting > 0 ? (
        <Link
          to={`/flows/${flow.id}/executions?status=waiting_for_message`}
          className="hidden shrink-0 rounded-full bg-status-warning-soft px-2 py-0.5 text-xs font-medium text-status-warning hover:underline md:inline"
        >
          {t("flows.list.waiting", { count: week.waiting })}
        </Link>
      ) : null}

      <ToggleSwitch flow={flow} pending={pending} disabled={!canUse} onOn={() => void turnOn()} onOff={() => void turnOff()} />

      <ActionsMenu
        className="shrink-0"
        label={t("flows.list.actionsOf", { name: flow.name })}
        actions={[
          { label: t("flows.list.edit"), icon: <Pencil />, onSelect: () => navigate(`/flows/${flow.id}`) },
          { label: t("flows.list.executions"), icon: <ListChecks />, onSelect: () => navigate(`/flows/${flow.id}/executions`) },
          { label: t("flows.list.duplicate"), icon: <Copy />, onSelect: () => void duplicate() },
          {
            label: t("flows.list.archiveAction"),
            icon: <Archive />,
            hidden: archived,
            onSelect: () => void (flow.status === "published" ? turnOff() : archiveDraft()),
          },
          { label: t("flows.list.restore"), icon: <Power />, hidden: !archived, onSelect: () => void turnOn() },
          {
            label: t("flows.list.deleteAction"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => void remove(),
          },
        ]}
      />
    </li>
  )
})

function FlowUsage({ flow }: { flow: FlowSummary }) {
  const { t } = useTranslation()
  const stats = flow.stats
  if (!stats) return <span>{t("flows.list.neverUsed")}</span>
  return (
    <>
      <span className="inline-flex items-center gap-1">
        {t("flows.list.lastUsed")} <RelativeTime value={stats.lastExecutedAt} />
      </span>
      <Link
        to={`/flows/${flow.id}/executions`}
        className="inline-flex items-center gap-1.5 rounded hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={t("flows.list.recentLabel", { count: stats.last7Days.total, failed: stats.last7Days.failed })}
      >
        <RunDots statuses={stats.recent} />
        <span>{t("flows.list.week", { count: stats.last7Days.total })}</span>
      </Link>
    </>
  )
}

function ToggleSwitch({
  flow,
  pending,
  disabled,
  onOn,
  onOff,
}: {
  flow: FlowSummary
  pending: boolean
  disabled: boolean
  onOn: () => void
  onOff: () => void
}) {
  const { t } = useTranslation()
  const on = flow.status === "published"
  const isDraft = flow.status === "draft"
  const label = isDraft ? t("flows.toggle.draftHint") : on ? t("flows.toggle.off") : t("flows.toggle.on")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="mt-0.5 flex shrink-0 items-center sm:mt-0">
            <Switch
              checked={on}
              disabled={disabled || pending || isDraft}
              aria-label={label}
              onCheckedChange={(checked) => (checked ? onOn() : onOff())}
            />
          </span>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
