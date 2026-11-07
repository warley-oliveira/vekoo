import { memo, useId, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { CircleAlert, Lock, RefreshCw, SquarePen } from "lucide-react"

import { CardEmpty } from "@/components/dashboard/chart-card"
import { LoadingRegion } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/i18n"
import type { ChartModel } from "@/lib/custom-dashboards/chart-model"
import { chartSummary } from "@/lib/custom-dashboards/chart-summary"
import { formatValue } from "@/lib/custom-dashboards/format"
import { FormulaError } from "@/lib/custom-dashboards/formula-engine"
import { hasOwnPeriod } from "@/lib/custom-dashboards/query"
import type { DashboardWidget, VisualConfig, WidgetType } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { useFormulaErrorMessage } from "./use-formula-error"
import { useWidgetActions } from "./widget-actions"
import type { useWidgetView } from "./use-widget-view"
import { CartesianChart } from "./widgets/cartesian-chart"
import { FunnelWidget } from "./widgets/funnel-widget"
import { GaugeWidget, ProgressWidget } from "./widgets/goal-widgets"
import { HeatmapWidget } from "./widgets/heatmap-widget"
import { KpiWidget } from "./widgets/kpi-widget"
import { NumberTrendWidget } from "./widgets/number-trend-widget"
import { PartsChart } from "./widgets/parts-chart"
import { RadarWidget } from "./widgets/radar-chart"
import { TableWidget } from "./widgets/table-widget"
import { RichTextWidget, SectionDividerWidget } from "./widgets/text-widgets"

type WidgetView = ReturnType<typeof useWidgetView>

type WidgetBodyProps = {
  widget: DashboardWidget
  view: WidgetView
  editing: boolean
  animate: boolean
}

/** O miolo do card, com a matriz inteira: carregando, sem acesso, erro, sem dados, parcial e o desenho. */
export const WidgetBody = memo(function WidgetBody({ widget, view, editing, animate }: WidgetBodyProps) {
  const { t } = useTranslation()
  const config = widget.visualConfig
  const actions = useWidgetActions()
  const edit = editing && actions ? () => actions.edit(widget.id) : undefined

  if (widget.widgetType === "section_divider") return <SectionDividerWidget title={widget.title} config={config} />
  if (widget.widgetType === "rich_text") {
    return <RichTextWidget config={config} emptyTitle={t("customDashboards.card.textEmpty")} emptyHint={t("customDashboards.card.textEmptyHint")} />
  }

  if (view.unconfigured) {
    return (
      <CardState
        icon={<SquarePen />}
        title={t("customDashboards.card.unconfigured")}
        action={edit ? { label: t("customDashboards.card.configure"), onClick: edit } : undefined}
      />
    )
  }

  if (view.forbidden) {
    return (
      <CardState
        icon={<Lock />}
        title={t("customDashboards.card.forbidden")}
        description={t("customDashboards.card.forbiddenHint")}
        action={edit ? { label: t("customDashboards.card.configure"), onClick: edit } : undefined}
      />
    )
  }

  if (view.formulaError) return <FormulaProblem error={view.formulaError} onEdit={edit} />

  if (view.error && !view.data) {
    if (view.error instanceof ApiError && view.error.status === 403) {
      return <CardState icon={<Lock />} title={t("customDashboards.card.forbidden")} description={t("customDashboards.card.forbiddenHint")} />
    }
    return <CardError error={view.error} onRetry={view.retry} onEdit={edit} />
  }

  if (view.sourcesError && !view.data) {
    return <CardError error={view.sourcesError} onRetry={() => void view.reloadSources()} />
  }

  if (view.isLoading || !view.data) return <CardSkeleton type={widget.widgetType} />

  const dim = view.isRefreshing ? "opacity-60 transition-opacity" : "transition-opacity"

  if (view.isEmpty) {
    return (
      <CardEmpty
        className={dim}
        title={t("customDashboards.card.emptyTitle")}
        description={t(hasOwnPeriod(widget.query) ? "customDashboards.card.emptyOwnPeriod" : "customDashboards.card.emptyHint")}
      />
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-1.5", dim)}>
      <WidgetFigure widget={widget} model={view.chart}>
        <WidgetVisual widget={widget} view={view} animate={animate} />
      </WidgetFigure>
      <PartialNote model={view.chart} truncated={view.table?.truncated} chosenLimit={Boolean(view.shownQuery.limit)} />
    </div>
  )
})

// Os outros tipos já se explicam: número e lista são texto, e medidor, tendência e calor têm o nome deles.
const DESCRIBED_TYPES = new Set<WidgetType>(["line_chart", "bar_chart", "area_chart", "pie_chart", "donut_chart", "radar"])

function WidgetFigure({ widget, model, children }: { widget: DashboardWidget; model: ChartModel | null; children: ReactNode }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const captionId = useId()
  const config = widget.visualConfig
  const summary = useMemo(
    () => (model && DESCRIBED_TYPES.has(widget.widgetType) ? chartSummary(model, config, language, t) : undefined),
    [config, language, model, t, widget.widgetType]
  )

  return (
    <figure aria-describedby={summary ? captionId : undefined} className="m-0 min-h-0 flex-1">
      {summary ? (
        <figcaption id={captionId} className="sr-only">
          {summary}
        </figcaption>
      ) : null}
      {children}
    </figure>
  )
}

function WidgetVisual({ widget, view, animate }: Pick<WidgetBodyProps, "widget" | "view" | "animate">) {
  const { t } = useTranslation()
  const config = widget.visualConfig

  switch (widget.widgetType) {
    case "kpi":
      return <KpiWidget value={view.figure} previous={view.previous} config={config} />
    case "number_trend":
      return <NumberTrendWidget value={view.figure} previous={view.previous} model={view.chart} config={config} />
    case "gauge":
      return <GaugeWidget value={view.figure} config={config} />
    case "progress_bar":
      return <ProgressWidget value={view.figure} config={config} />
    case "line_chart":
    case "bar_chart":
    case "area_chart":
      return view.chart ? <CartesianChart type={widget.widgetType} model={view.chart} config={config} animate={animate} /> : null
    case "pie_chart":
    case "donut_chart":
      return view.parts ? (
        <PartsChart parts={view.parts} donut={widget.widgetType === "donut_chart"} config={config} animate={animate} />
      ) : null
    case "radar":
      if (!view.chart) return null
      return view.chart.categories.length < 3 ? (
        <CardEmpty title={t("customDashboards.card.radarNeedsMore")} description={t("customDashboards.card.radarNeedsMoreHint")} />
      ) : (
        <RadarWidget model={view.chart} config={config} animate={animate} />
      )
    case "heatmap":
      return view.chart ? <HeatmapWidget model={view.chart} config={config} /> : null
    case "funnel":
      return view.chart ? <FunnelWidget model={view.chart} config={config} /> : null
    case "table":
      return view.table ? <TableWidget title={widget.title} table={view.table} config={config} /> : null
    default:
      return null
  }
}

/** O card não mostra tudo, e precisa dizer. Se o corte é o limite que a pessoa escolheu ("as dez maiores"), ela já sabe. */
function PartialNote({ model, truncated, chosenLimit }: { model: ChartModel | null; truncated?: boolean; chosenLimit: boolean }) {
  const { t } = useTranslation()
  const cut = !chosenLimit && (truncated || model?.truncated)
  const folded = model?.folded ?? 0

  if (!cut && !folded) return null

  return (
    <p className="shrink-0 text-xs text-muted-foreground">
      {cut ? t("customDashboards.card.truncated") : t("customDashboards.card.folded", { count: folded })}
    </p>
  )
}

function CardState({
  icon,
  title,
  description,
  action,
  tone = "muted",
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void; icon?: ReactNode }
  tone?: "muted" | "danger"
}) {
  return (
    <div className="cd-no-drag pointer-events-auto flex h-full min-h-20 flex-col items-center justify-center gap-1.5 overflow-y-auto rounded-lg bg-muted/40 px-3 py-3 text-center">
      <span aria-hidden className={cn("[&_svg]:size-4", tone === "danger" ? "text-status-danger" : "text-muted-foreground")}>
        {icon}
      </span>
      <p className="text-sm font-medium text-balance">{title}</p>
      {description ? <p className="max-w-xs text-xs text-pretty text-muted-foreground">{description}</p> : null}
      {action ? (
        <Button type="button" variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
          {action.icon}
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}

const SERVER_MESSAGE_STATUSES = new Set([422, 429, 503])

/** O card que falha mostra o erro só nele. A mensagem de consulta recusada vem pronta da API, no idioma certo. */
function CardError({ error, onRetry, onEdit }: { error: unknown; onRetry: () => void; onEdit?: () => void }) {
  const { t } = useTranslation()
  const apiError = error instanceof ApiError ? error : null
  const refused = apiError?.status === 422

  const description =
    apiError?.code === "network"
      ? t("errors.network")
      : apiError?.serverMessage && SERVER_MESSAGE_STATUSES.has(apiError.status)
        ? apiError.serverMessage
        : t("customDashboards.card.errorHint")

  return (
    <CardState
      icon={<CircleAlert />}
      tone="danger"
      title={t(refused ? "customDashboards.card.refused" : "customDashboards.card.error")}
      description={description}
      action={
        refused && onEdit
          ? { label: t("customDashboards.card.configure"), onClick: onEdit }
          : { label: t("errors.retry"), onClick: onRetry, icon: <RefreshCw /> }
      }
    />
  )
}

function FormulaProblem({ error, onEdit }: { error: FormulaError; onEdit?: () => void }) {
  const { t } = useTranslation()
  const message = useFormulaErrorMessage()

  return (
    <CardState
      icon={<CircleAlert />}
      tone="danger"
      title={t("customDashboards.card.formulaError")}
      description={message(error)}
      action={onEdit ? { label: t("customDashboards.card.configure"), onClick: onEdit } : undefined}
    />
  )
}

/** Esqueleto que espelha o card: número, gráfico ou linhas. */
export function CardSkeleton({ type }: { type: DashboardWidget["widgetType"] }) {
  if (type === "kpi" || type === "number_trend" || type === "progress_bar") {
    return (
      <LoadingRegion className="flex h-full flex-col justify-center gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-3 w-32" />
      </LoadingRegion>
    )
  }
  if (type === "gauge") {
    return (
      <LoadingRegion className="flex h-full items-center justify-center">
        <Skeleton className="aspect-square h-3/4 max-h-32 rounded-full" />
      </LoadingRegion>
    )
  }
  if (type === "pie_chart" || type === "donut_chart" || type === "radar") {
    return (
      <LoadingRegion className="flex h-full items-center justify-center">
        <Skeleton className="aspect-square h-3/4 max-h-52 rounded-full" />
      </LoadingRegion>
    )
  }
  if (type === "heatmap") {
    return (
      <LoadingRegion className="grid h-full grid-cols-7 grid-rows-4 gap-0.5 overflow-hidden">
        {Array.from({ length: 28 }, (_, index) => (
          <Skeleton key={index} className="rounded-[3px]" />
        ))}
      </LoadingRegion>
    )
  }
  if (type === "line_chart" || type === "area_chart") {
    return (
      <LoadingRegion className="flex h-full flex-col gap-3 pt-2">
        <Skeleton className="w-full flex-1 rounded-md" />
        <Skeleton className="h-3 w-full shrink-0" />
      </LoadingRegion>
    )
  }
  if (type === "table" || type === "funnel") {
    return (
      <LoadingRegion className="flex h-full flex-col gap-2.5 overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full shrink-0" />
        ))}
      </LoadingRegion>
    )
  }
  return (
    <LoadingRegion className="flex h-full items-end gap-2 overflow-hidden pt-4">
      {[50, 72, 40, 86, 62, 94, 58, 76].map((height, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-sm rounded-b-none" style={{ height: `${height}%` }} />
      ))}
    </LoadingRegion>
  )
}

/** A tabela gêmea do gráfico: quem não enxerga cor, ou quer o número exato, lê aqui. */
export const WidgetTwinTable = memo(function WidgetTwinTable({
  model,
  config,
  title,
}: {
  model: ChartModel
  config: VisualConfig
  title: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <div className="h-full overflow-auto [scrollbar-width:thin]">
      <Table aria-label={title}>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead className="h-8 px-2 text-xs">{model.dimensionLabel || t("customDashboards.chart.measure")}</TableHead>
            {model.series.map((series) => (
              <TableHead key={series.key} className="h-8 px-2 text-right text-xs">
                {series.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.categories.map((category, index) => (
            <TableRow key={category.id}>
              <TableCell className="px-2 py-1.5 text-xs">{category.title}</TableCell>
              {model.series.map((series) => (
                <TableCell key={series.key} className="px-2 py-1.5 text-right text-xs tabular-nums">
                  {formatValue(series.values[index], config, language)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
})
