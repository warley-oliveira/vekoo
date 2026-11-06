import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { MessageSquare, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  ListSkeleton,
  StatTile,
  StatusBadge,
  useConfirm,
  type StatusTone,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"
import { apiDelete } from "@/lib/api"
import { CATEGORIES, templateSummary } from "@/lib/connectors/template-builder"
import type { TemplateStatus, WhatsappCloudConnector, WhatsappTemplate } from "@/lib/connectors/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { TemplatePanel } from "./template-panel"

const STATUS_TONES: Record<TemplateStatus, StatusTone> = {
  approved: "success",
  pending: "warning",
  in_appeal: "warning",
  rejected: "danger",
  paused: "warning",
  disabled: "danger",
  limit_exceeded: "danger",
  archived: "neutral",
  pending_deletion: "neutral",
  deleted: "neutral",
  removed: "neutral",
}

type TemplatesResponse = { templates: WhatsappTemplate[] }

export function TemplatesTab({ connector }: { connector: WhatsappCloudConnector }) {
  const { t } = useTranslation()
  const key = `/connectors/${connector.id}/templates`
  // A listagem sincroniza com a Meta antes de responder: voltar à aba não vale essa viagem.
  const { data, error, isLoading, isValidating, mutate } = useApi<TemplatesResponse>(key, {
    revalidateOnFocus: false,
  })
  const confirm = useConfirm()

  const [query, setQuery] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [panel, setPanel] = useState<{ open: boolean; template: WhatsappTemplate | null }>({
    open: false,
    template: null,
  })

  const templates = useMemo(() => data?.templates ?? [], [data])

  const counts = useMemo(() => {
    const result = { approved: 0, pending: 0, rejected: 0 }
    for (const template of templates) {
      if (template.status === "approved") result.approved += 1
      else if (template.status === "pending") result.pending += 1
      else if (template.status === "rejected") result.rejected += 1
    }
    return result
  }, [templates])

  const statusOptions = useMemo(() => {
    const present = [...new Set(templates.map((template) => template.status))]
    return present.map((value) => ({
      value,
      label: t(`connectors.templates.status.${value}`),
      count: templates.filter((template) => template.status === value).length,
    }))
  }, [templates, t])

  const filtered = useMemo(
    () =>
      templates.filter((template) => {
        if (statuses.length > 0 && !statuses.includes(template.status)) return false
        if (categories.length > 0 && !categories.includes(template.category)) return false
        if (!query) return true
        return [
          template.name,
          t(`connectors.templates.categories.${template.category}`, { defaultValue: template.category }),
          templateSummary(template) ?? "",
        ].some((text) => matchesSearch(text, query))
      }),
    [templates, statuses, categories, query, t]
  )

  const openCreate = () => setPanel({ open: true, template: null })
  const clearFilters = () => {
    setQuery("")
    setStatuses([])
    setCategories([])
  }

  async function remove(template: WhatsappTemplate) {
    const confirmed = await confirm({
      title: t("connectors.templates.deleteTitle", { name: template.name }),
      description: t("connectors.templates.deleteDescription"),
      confirmLabel: t("connectors.templates.delete"),
      destructive: true,
      onConfirm: async () => {
        await apiDelete(`${key}/${template.id}`)
        await mutate(
          (current) =>
            current && { templates: current.templates.filter((item) => item.id !== template.id) },
          { revalidate: false }
        )
      },
    })
    if (confirmed) toast.success(t("connectors.templates.deleted"))
  }

  if (isLoading) return <ListSkeleton rows={4} />
  if (error) {
    return (
      <ErrorState
        error={error}
        title={t("connectors.templates.loadError")}
        onRetry={() => void mutate()}
      />
    )
  }

  const panelElement = (
    <TemplatePanel
      open={panel.open}
      onOpenChange={(open) => setPanel((current) => ({ ...current, open }))}
      connectorId={connector.id}
      connectorName={connector.name}
      template={panel.template}
      onSaved={() => void mutate()}
    />
  )

  if (templates.length === 0) {
    return (
      <>
        <EmptyState
          icon={<MessageSquare className="size-5" />}
          title={t("connectors.templates.empty")}
          description={t("connectors.templates.emptyHint")}
          action={{ label: t("connectors.templates.create"), onClick: openCreate }}
        />
        {panelElement}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-sm text-pretty text-muted-foreground">
          {t("connectors.templates.description")}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10"
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            <RefreshCw className={cn(isValidating && "animate-spin")} />
            {t("connectors.templates.refresh")}
          </Button>
          <Button size="sm" className="pointer-coarse:h-10" onClick={openCreate}>
            <Plus />
            {t("connectors.templates.create")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label={t("connectors.templates.stats.approved")} value={counts.approved} />
        <StatTile label={t("connectors.templates.stats.pending")} value={counts.pending} />
        <StatTile label={t("connectors.templates.stats.rejected")} value={counts.rejected} />
      </div>

      <FilterBar
        search={{
          value: query,
          onChange: setQuery,
          debounce: 0,
          placeholder: t("connectors.templates.search"),
          shortcut: false,
        }}
        activeCount={(statuses.length ? 1 : 0) + (categories.length ? 1 : 0)}
        onClear={clearFilters}
        resultLabel={t("connectors.templates.count", { count: filtered.length })}
        filters={
          <>
            <FacetedFilter
              title={t("connectors.templates.statusFilter")}
              options={statusOptions}
              value={statuses}
              onChange={setStatuses}
            />
            <FacetedFilter
              title={t("connectors.templates.category")}
              options={CATEGORIES.map((value) => ({
                value,
                label: t(`connectors.templates.categories.${value}`),
              }))}
              value={categories}
              onChange={setCategories}
            />
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={t("connectors.templates.noResults")}
          action={{ label: t("connectors.templates.clearFilters"), onClick: clearFilters }}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl ring-1 ring-foreground/10">
          {filtered.map((template) => (
            <li key={template.id} className="relative flex items-start gap-3 p-4 transition-colors hover:bg-muted/40">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    className="min-w-0 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                    onClick={() => setPanel({ open: true, template })}
                  >
                    {template.name}
                  </button>
                  <StatusBadge tone={STATUS_TONES[template.status] ?? "neutral"}>
                    {t(`connectors.templates.status.${template.status}`, {
                      defaultValue: template.status,
                    })}
                  </StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`connectors.templates.categories.${template.category}`, {
                    defaultValue: template.category,
                  })}{" "}
                  ·{" "}
                  {t(`connectors.templates.languages.${template.language}`, {
                    defaultValue: template.language,
                  })}
                </p>
                {templateSummary(template) ? (
                  <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
                    {templateSummary(template)}
                  </p>
                ) : null}
                {template.rejectedReason && template.rejectedReason !== "NONE" ? (
                  <p className="text-xs break-words text-status-danger">
                    {t("connectors.templates.rejectedReason", { reason: template.rejectedReason })}
                  </p>
                ) : null}
                {template.correctCategory ? (
                  <p className="text-xs text-status-warning">
                    {t("connectors.templates.categoryChanged", {
                      category: t(`connectors.templates.categories.${template.correctCategory}`, {
                        defaultValue: template.correctCategory,
                      }),
                    })}
                  </p>
                ) : null}
              </div>
              <div className="relative z-10">
                <ActionsMenu
                  label={t("connectors.templates.actionsOf", { name: template.name })}
                  actions={[
                    {
                      label: t("connectors.templates.edit"),
                      icon: <Pencil />,
                      onSelect: () => setPanel({ open: true, template }),
                    },
                    {
                      label: t("connectors.templates.delete"),
                      icon: <Trash2 />,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => void remove(template),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {panelElement}
    </div>
  )
}
