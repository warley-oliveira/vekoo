import { memo, useState, type KeyboardEvent, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  ChartColumn,
  Copy,
  Download,
  GripVertical,
  Lock,
  LockOpen,
  Maximize2,
  Pencil,
  RefreshCw,
  Table2,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { ActionsMenu } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useInViewOnce } from "@/hooks/custom-dashboards/use-widget-data"
import { parseDay, type DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { formatDateInterval } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { chartModelCsv, downloadCsv, figureCsv, tableModelCsv } from "@/lib/custom-dashboards/csv"
import { hasOwnPeriod } from "@/lib/custom-dashboards/query"
import type { DashboardWidget } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { iconFor } from "./icons"
import { useWidgetView } from "./use-widget-view"
import { useWidgetActions } from "./widget-actions"
import { WidgetBody, WidgetTwinTable } from "./widget-body"
import { WidgetNotesPopover } from "./widget-notes"

// Em desenvolvimento, conta os desenhos de cada card: é o que mede se mexer num deles redesenha os outros.
declare global {
  interface Window {
    __cdRenders?: Record<string, number>
  }
}

function countRender(id: string) {
  if (!import.meta.env.DEV) return
  const counts = (window.__cdRenders ??= {})
  counts[id] = (counts[id] ?? 0) + 1
}

/** Clique em controle dentro do card, ou vindo de um portal dele (menu, popover), não abre o editor. */
function ignoresCardClick(event: MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement
  return (
    !event.currentTarget.contains(target) ||
    Boolean(target.closest("a, button, input, select, textarea, label, [role='menuitem'], .cd-no-drag"))
  )
}

type WidgetCardProps = {
  widget: DashboardWidget
  period: DashboardPeriod
  editing?: boolean
  refreshInterval?: number
  /**
   * `grid` e `stack`: no painel, com as ações. `preview`: no editor, sem ações, e sem esperar aparecer na tela. `expanded`:
   * no diálogo de ampliar, onde o título já está em cima.
   */
  presentation?: "grid" | "stack" | "preview" | "expanded"
  selected?: boolean
  className?: string
}

const KEYBOARD_MOVES: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** O card do painel: moldura, cabeçalho, ações e os estados. Mexer em outro card não passa por aqui. */
export const WidgetCard = memo(function WidgetCard({
  widget,
  period,
  editing = false,
  refreshInterval,
  presentation = "grid",
  selected = false,
  className,
}: WidgetCardProps) {
  countRender(widget.id)

  const { t } = useTranslation()
  const actions = useWidgetActions()
  const onDashboard = presentation === "grid" || presentation === "stack"
  const { ref, seen } = useInViewOnce(onDashboard)
  const view = useWidgetView(widget, period, { enabled: seen, refreshInterval })
  const [showTable, setShowTable] = useState(false)

  const spec = WIDGET_SPECS[widget.widgetType]
  const config = widget.visualConfig
  const locked = Boolean(config.locked)
  const canTwin = Boolean(view.chart) && !view.isEmpty && widget.widgetType !== "number_trend"
  const hasFigure = spec.figure && view.figure !== null
  const hasRows = hasFigure || (Boolean(view.chart || view.table) && !view.isEmpty)
  const notes = config.annotations ?? []
  const Icon = config.icon ? iconFor(config.icon) : null
  const editingHere = editing && onDashboard

  function exportCsv() {
    if (view.table) downloadCsv(tableModelCsv(view.table.columns, view.table.rows), widget.title)
    else if (view.chart) downloadCsv(chartModelCsv(view.chart), widget.title)
    else if (hasFigure) downloadCsv(figureCsv(widget.title, view.figure, view.previous, t("customDashboards.card.csvPrevious")), widget.title)
  }

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>) {
    const move = KEYBOARD_MOVES[event.key]
    if (!move) return
    event.preventDefault()
    if (event.shiftKey) actions?.resizeBy(widget.id, move[0], move[1])
    else actions?.moveBy(widget.id, move[0], move[1])
  }

  function onCardClick(event: MouseEvent<HTMLElement>) {
    if (!editingHere || !actions || ignoresCardClick(event) || actions.wasJustDragged()) return
    actions.edit(widget.id)
  }

  const menu = onDashboard ? (
    <ActionsMenu
      label={t("customDashboards.card.actionsOf", { title: widget.title })}
      actions={[
        {
          label: t(showTable ? "customDashboards.card.showChart" : "customDashboards.card.showTable"),
          icon: showTable ? <ChartColumn /> : <Table2 />,
          onSelect: () => setShowTable(!showTable),
          hidden: !canTwin,
        },
        {
          label: t("customDashboards.card.expand"),
          icon: <Maximize2 />,
          onSelect: () => actions?.expand(widget),
          hidden: !spec.needsData || editing,
        },
        { label: t("customDashboards.card.refresh"), icon: <RefreshCw />, onSelect: view.retry, hidden: !spec.needsData || editing },
        { label: t("customDashboards.card.exportCsv"), icon: <Download />, onSelect: exportCsv, hidden: !hasRows },
        {
          label: t("customDashboards.card.duplicate"),
          icon: <Copy />,
          onSelect: () => actions?.duplicate(widget),
          hidden: !editing,
          separatorBefore: true,
        },
        {
          label: t(locked ? "customDashboards.card.unlock" : "customDashboards.card.lock"),
          icon: locked ? <LockOpen /> : <Lock />,
          onSelect: () => actions?.toggleLock(widget.id),
          hidden: !editing || presentation === "stack",
        },
        {
          label: t("customDashboards.card.remove"),
          icon: <Trash2 />,
          onSelect: () => actions?.remove(widget),
          destructive: true,
          hidden: !editing,
          separatorBefore: true,
        },
      ]}
    />
  ) : null

  const editButton = editingHere ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={t("customDashboards.card.editLabel", { title: widget.title })}
      title={t("customDashboards.card.edit")}
      className="text-muted-foreground pointer-coarse:hidden"
      onClick={() => actions?.edit(widget.id)}
    >
      <Pencil />
    </Button>
  ) : null

  // O pegador existe só na grade: a pilha do celular não muda de ordem. É ele que dá o teclado ao arraste.
  const handle =
    presentation === "grid" && editing ? (
      locked ? (
        <Lock aria-label={t("customDashboards.card.lockedLabel")} className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("customDashboards.card.moveLabel", { title: widget.title })}
                className="cd-drag-handle -ml-1 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                onKeyDown={onHandleKey}
              />
            }
          >
            <GripVertical />
          </TooltipTrigger>
          <TooltipContent className="max-w-56">{t("customDashboards.card.moveHint")}</TooltipContent>
        </Tooltip>
      )
    ) : null

  // Seção: sem moldura. Em edição, o fio ganha as mesmas ações, à direita.
  if (spec.frameless) {
    return (
      <div
        ref={ref}
        data-widget={widget.id}
        onClick={onCardClick}
        className={cn(
          "group/card relative flex h-full items-end gap-2 rounded-lg",
          editingHere && "cursor-move px-1 outline-1 -outline-offset-1 outline-border/70 outline-dashed hover:outline-primary/40",
          selected && "outline-primary",
          className
        )}
      >
        {handle ? <div className="mb-1">{handle}</div> : null}
        <div className="min-w-0 flex-1">
          <WidgetBody widget={widget} view={view} editing={editing} animate={false} />
        </div>
        {editingHere ? (
          <div className="cd-no-drag mb-0.5 flex items-center gap-0.5">
            {editButton}
            {menu}
          </div>
        ) : null}
      </div>
    )
  }

  const subtitle = config.subtitle?.trim()
  const ownPeriod = hasOwnPeriod(widget.query)

  return (
    <article
      ref={ref}
      data-widget={widget.id}
      data-editing={editingHere || undefined}
      onClick={onCardClick}
      className={cn(
        "group/card flex h-full min-h-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10",
        editingHere && "transition-shadow hover:ring-foreground/25",
        presentation === "grid" && editing && !locked && "cursor-move",
        presentation === "stack" && editing && "cursor-pointer",
        selected && "ring-2 ring-primary hover:ring-primary",
        className
      )}
    >
      {presentation === "expanded" ? null : (
        <header className="relative flex items-start gap-1.5 px-4 pt-3 pb-1">
          {handle}
          <div className="min-w-0 flex-1">
            <h3 className="flex items-start gap-1.5 text-sm font-medium">
              {Icon ? <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> : null}
              {/* No celular a linha é estreita e o card é de ler: o título pode quebrar. */}
              <span title={widget.title} className={presentation === "stack" ? "line-clamp-2 min-w-0 wrap-anywhere hyphens-auto" : "truncate"}>
                {widget.title}
              </span>
              {view.error && view.data ? (
                // Um número velho não pode parecer atual: o que está na tela é da última vez que deu certo.
                <span title={t("customDashboards.card.stale")} className="shrink-0 text-status-warning">
                  <TriangleAlert aria-label={t("customDashboards.card.stale")} className="size-3.5" />
                </span>
              ) : null}
            </h3>
            {subtitle || ownPeriod ? (
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
                {subtitle && ownPeriod ? " · " : null}
                {ownPeriod ? <OwnPeriodLabel widget={widget} /> : null}
              </p>
            ) : null}
          </div>

          {/* Nota escrita fica sempre à vista: é recado para quem lê. */}
          {onDashboard && notes.length > 0 ? (
            <div className="cd-no-drag">
              <WidgetNotesPopover widget={widget} editing={editing} />
            </div>
          ) : null}

          {onDashboard ? (
            <div
              className={cn(
                "cd-no-drag flex shrink-0 items-center gap-0.5 transition-opacity",
                // Com mouse, as ações aparecem por cima, ao passar: o título usa a largura toda enquanto ninguém mexe.
                "absolute top-2 right-2 rounded-md bg-card pl-1 opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-data-popup-open:opacity-100",
                "pointer-coarse:static pointer-coarse:bg-transparent pointer-coarse:pl-0 pointer-coarse:opacity-100"
              )}
            >
              {!editing && canTwin ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-pressed={showTable}
                  aria-label={t(showTable ? "customDashboards.card.showChart" : "customDashboards.card.showTable")}
                  title={t(showTable ? "customDashboards.card.showChart" : "customDashboards.card.showTable")}
                  className="text-muted-foreground pointer-coarse:hidden"
                  onClick={() => setShowTable(!showTable)}
                >
                  {showTable ? <ChartColumn /> : <Table2 />}
                </Button>
              ) : null}
              {!editing && spec.needsData ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("customDashboards.card.expandLabel", { title: widget.title })}
                  title={t("customDashboards.card.expand")}
                  className="text-muted-foreground pointer-coarse:hidden"
                  onClick={() => actions?.expand(widget)}
                >
                  <Maximize2 />
                </Button>
              ) : null}
              {editing && notes.length === 0 ? <WidgetNotesPopover widget={widget} editing={editing} /> : null}
              {editButton}
              {menu}
            </div>
          ) : null}
        </header>
      )}

      <div
        // Em edição, o card inteiro responde ao arraste: o gráfico não pode pegar o ponteiro.
        className={cn(
          "min-h-0 flex-1 px-4 pb-3",
          presentation === "expanded" && "pt-3",
          editingHere && "select-none [&>*]:pointer-events-none [&_.cd-no-drag]:pointer-events-auto"
        )}
      >
        {showTable && canTwin && view.chart ? (
          <WidgetTwinTable model={view.chart} config={config} title={widget.title} />
        ) : (
          <WidgetBody widget={widget} view={view} editing={editing} animate={!editing && onDashboard} />
        )}
      </div>
    </article>
  )
})

/** O card não segue o período do painel, e precisa dizer. */
function OwnPeriodLabel({ widget }: { widget: DashboardWidget }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const range = widget.query.timeRange
  if (range?.preset) return <>{t(`customDashboards.period.presets.${range.preset}`, { defaultValue: range.preset })}</>

  const from = range?.start ? parseDay(range.start) : null
  const to = range?.end ? parseDay(range.end) : null
  return from && to ? <>{formatDateInterval(from, to, language)}</> : null
}
