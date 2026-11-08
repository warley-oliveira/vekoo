import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "@/lib/router"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"

import "@/components/custom-dashboards/viz-tokens.css"
import { CardGridSkeleton, ErrorState, Form, FormActions, SectionCard, TextField } from "@/components/shared"
import { useDashboardMutations, useDataSources } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { useEditorStore } from "@/hooks/custom-dashboards/use-editor-store"
import { ApiError } from "@/lib/api"
import { GRID_COLS } from "@/lib/custom-dashboards/catalog"
import { dashboardDetailsSchema, type DashboardDetailsValues } from "@/lib/custom-dashboards/dashboard-details"
import {
  DASHBOARD_TEMPLATES,
  instantiateTemplate,
  templateItems,
  type DashboardTemplate,
} from "@/lib/custom-dashboards/templates"
import type { DataSourceMeta } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { IconField } from "./dashboard-details-dialog"
import { iconFor } from "./icons"

/**
 * Criar um painel: do zero ou de um modelo. É uma aba, e não um diálogo: um modelo precisa de espaço para mostrar o que traz,
 * e o endereço (`?tab=new`) funciona no botão voltar.
 */
export default function NewDashboardTab() {
  const { t } = useTranslation()
  const { dataSources, error, reload } = useDataSources()
  const { create } = useDashboardMutations()
  const [, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState<string | null>(null)

  function openDashboard(id: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set("tab", id)
        return next
      },
      { replace: true }
    )
  }

  async function createFromTemplate(template: DashboardTemplate, sources: DataSourceMeta[]) {
    if (creating) return
    setCreating(template.id)
    try {
      const dashboard = await create({
        name: t(`customDashboards.templates.${template.id}.name`),
        description: t(`customDashboards.templates.${template.id}.description`),
        icon: template.icon,
        widgets: instantiateTemplate(template, sources, t).map((widget, position) => ({ ...widget, position })),
      })
      toast.success(t("customDashboards.newDashboard.created", { name: dashboard.name }))
      openDashboard(dashboard.id)
    } catch (failure) {
      toast.error(failure instanceof ApiError && failure.serverMessage ? failure.serverMessage : t("customDashboards.toolbar.actionFailed"))
    } finally {
      setCreating(null)
    }
  }

  const schema = useMemo(() => dashboardDetailsSchema(t), [t])
  const form = useForm<DashboardDetailsValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", icon: "chart" },
    mode: "onBlur",
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <SectionCard title={t("customDashboards.newDashboard.blankTitle")} description={t("customDashboards.newDashboard.blankHint")}>
        <Form
          form={form}
          className="flex flex-col gap-4"
          onSubmit={async (values) => {
            const dashboard = await create({
              name: values.name,
              description: values.description || null,
              icon: values.icon,
            })
            toast.success(t("customDashboards.newDashboard.created", { name: dashboard.name }))
            // Painel em branco: não há o que ler ainda, e a próxima coisa é pôr cards.
            useEditorStore.getState().start({ ...dashboard, widgets: [] })
            openDashboard(dashboard.id)
          }}
        >
          <TextField
            control={form.control}
            name="name"
            label={t("customDashboards.details.name")}
            placeholder={t("customDashboards.newDashboard.namePlaceholder")}
            maxLength={120}
            autoFocus
          />
          <IconField control={form.control} label={t("customDashboards.details.icon")} />
          <FormActions submitLabel={t("customDashboards.newDashboard.create")} />
        </Form>
      </SectionCard>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold">{t("customDashboards.newDashboard.templatesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("customDashboards.newDashboard.templatesHint")}</p>
        </div>

        {error && !dataSources ? (
          <ErrorState error={error} onRetry={() => void reload()} />
        ) : !dataSources ? (
          <CardGridSkeleton cards={4} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DASHBOARD_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                sources={dataSources}
                creating={creating === template.id}
                onCreate={() => void createFromTemplate(template, dataSources)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TemplateCard({
  template,
  sources,
  creating,
  onCreate,
}: {
  template: DashboardTemplate
  sources: DataSourceMeta[]
  creating: boolean
  onCreate: () => void
}) {
  const { t } = useTranslation()
  const Icon = iconFor(template.icon)
  const items = templateItems(template, sources)
  const missing = template.items.length - items.length
  const unusable = items.length === 0

  return (
    <button
      type="button"
      disabled={unusable}
      aria-busy={creating}
      onClick={onCreate}
      className={cn(
        "group flex flex-col gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
        unusable && "pointer-events-none opacity-50"
      )}
    >
      {/* O desenho do painel: o que se vai receber, antes de escolher. */}
      <span
        aria-hidden
        className="grid h-24 w-full gap-0.5 rounded-md bg-muted/50 p-1.5"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridAutoRows: "1fr" }}
      >
        {items.map(({ recipe, layout }) => (
          <span
            key={`${recipe.id}-${layout.x}-${layout.y}`}
            className="rounded-[2px] bg-foreground/10"
            style={{ gridColumn: `${layout.x + 1} / span ${layout.w}`, gridRow: `${layout.y + 1} / span ${layout.h}` }}
          />
        ))}
      </span>
      <span className="flex items-start gap-2">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t(`customDashboards.templates.${template.id}.name`)}</span>
          <span className="block text-xs text-pretty text-muted-foreground">{t(`customDashboards.templates.${template.id}.description`)}</span>
        </span>
        {creating ? (
          <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {t("customDashboards.newDashboard.cards", { count: items.length })}
        {missing > 0 ? ` · ${t("customDashboards.newDashboard.missing", { count: missing })}` : ""}
      </span>
    </button>
  )
}
