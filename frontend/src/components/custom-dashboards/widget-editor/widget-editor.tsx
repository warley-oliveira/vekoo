import { useEffect, useMemo, useRef, useState } from "react"
import { FormProvider, useForm, useFormContext, useWatch, type FieldErrors } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Callout, DetailSkeleton, ErrorState, FormActions, ResponsiveDialog, useFormSubmit } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDataSources, useFilterOptions } from "@/hooks/custom-dashboards/use-custom-dashboards"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useGuardedClose, useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { columnLetter, GRID_MARGIN, GRID_ROW_HEIGHT, MAX_ROWS, WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { MAX_SLICES } from "@/lib/custom-dashboards/chart-model"
import {
  adaptToType,
  describeEditor,
  editorToWidget,
  hasRules,
  widgetToEditor,
  type EditorValues,
} from "@/lib/custom-dashboards/editor-model"
import { validateFormula } from "@/lib/custom-dashboards/formula-engine"
import { newWidgetId } from "@/lib/custom-dashboards/layout"
import { isFilterFilled } from "@/lib/custom-dashboards/query"
import type { DashboardWidget, DataSourceMeta, QueryFilter, WidgetLayout, WidgetQuery } from "@/lib/custom-dashboards/types"

import { useFormulaErrorMessage } from "../use-formula-error"
import { useWidgetView } from "../use-widget-view"
import { WidgetCard } from "../widget-card"
import { AppearanceSection } from "./appearance-section"
import { DataSection } from "./data-section"
import { RulesSection } from "./rules-section"

export type EditorTarget =
  | { kind: "edit"; widget: DashboardWidget }
  | { kind: "new"; values: EditorValues; size: Pick<WidgetLayout, "w" | "h"> }

type WidgetEditorPanelProps = {
  target: EditorTarget | null
  period: DashboardPeriod
  onClose: () => void
  /** O card pronto. Quem chama decide se é novo ou troca. */
  onApply: (widget: Omit<DashboardWidget, "position">, target: EditorTarget) => void
}

const QUERY_DEBOUNCE = 400
const MAX_PREVIEW_HEIGHT = 380
const VISUAL_DATA_FIELDS = new Set(["goalValue", "goalLabel", "content"])

type EditorTab = "data" | "appearance" | "rules"

function tabOfError(errors: FieldErrors<EditorValues>): EditorTab {
  if (errors.visual) {
    const keys = Object.keys(errors.visual)
    if (keys.some((key) => VISUAL_DATA_FIELDS.has(key))) return "data"
    if (keys.some((key) => ["valueMap", "thresholds", "conditionalRules"].includes(key))) return "rules"
    return "appearance"
  }
  return "data"
}

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string, formulaMessage: (error: ReturnType<typeof validateFormula>) => string) {
  const requireFilters = (filters: QueryFilter[] | undefined, path: (string | number)[], ctx: z.RefinementCtx) => {
    filters?.forEach((filter, index) => {
      if (!isFilterFilled(filter)) {
        ctx.addIssue({ code: "custom", path: [...path, index, "value"], message: t("customDashboards.validation.filterValue") })
      }
    })
  }

  return z.custom<EditorValues>().superRefine((values, ctx) => {
    const issue = (path: (string | number)[], key: string) => ctx.addIssue({ code: "custom", path, message: t(key) })
    const spec = WIDGET_SPECS[values.widgetType]

    if (!values.title?.trim()) issue(["title"], "customDashboards.validation.title")
    if (!spec.needsData) return

    if (values.useFormula) {
      if (!values.formulaSteps.length) issue(["formula"], "customDashboards.validation.formulaSteps")
      values.formulaSteps.forEach((step, index) => {
        if (step.aggregation !== "count" && !step.metric) issue(["formulaSteps", index, "metric"], "customDashboards.validation.metricField")
        requireFilters(step.filters, ["formulaSteps", index, "filters"], ctx)
      })
      if (!values.formula.trim()) {
        issue(["formula"], "customDashboards.validation.formula")
      } else {
        const error = validateFormula(values.formula, values.formulaSteps.map((step) => step.id))
        if (error) ctx.addIssue({ code: "custom", path: ["formula"], message: formulaMessage(error) })
      }
    } else {
      if (!values.dataSource) issue(["dataSource"], "customDashboards.validation.source")

      if (!values.records) {
        const letters = values.metrics.map((_, index) => columnLetter(index))
        values.metrics.forEach((metric, index) => {
          if (metric.formula !== null) {
            const error = metric.formula.trim()
              ? validateFormula(metric.formula, letters.filter((_, position) => position !== index))
              : null
            if (!metric.formula.trim()) issue(["metrics", index, "formula"], "customDashboards.validation.formula")
            else if (error) ctx.addIssue({ code: "custom", path: ["metrics", index, "formula"], message: formulaMessage(error) })
            return
          }
          if (metric.aggregation !== "count" && !metric.field) issue(["metrics", index, "field"], "customDashboards.validation.metricField")
          requireFilters(metric.filters, ["metrics", index, "filters"], ctx)
        })
      }

      requireFilters(values.filters, ["filters"], ctx)

      if (values.limit !== null && (values.limit < 1 || values.limit > MAX_ROWS)) issue(["limit"], "customDashboards.validation.limit")
    }

    if (spec.grouping === "category" && !values.breakdown) issue(["breakdown"], "customDashboards.validation.breakdown")
    if (spec.goal && !(values.visual.goalValue && values.visual.goalValue > 0)) issue(["visual", "goalValue"], "customDashboards.validation.goal")
    if (values.periodMode === "custom" && !values.periodRange) issue(["periodRange"], "customDashboards.validation.period")
  })
}

/**
 * Editar um card: a escolha à esquerda, e o card de verdade à direita, respondendo enquanto se mexe. No lugar do assistente
 * de três passos e do modal da origem, é uma tela só, para novo e para existente: quem quer só um número não atravessa nada.
 */
export function WidgetEditorPanel({ target, period, onClose, onApply }: WidgetEditorPanelProps) {
  const retained = useRetained(target)
  const openCount = useOpenCount(Boolean(target))
  const { dataSources, error, reload } = useDataSources()

  if (!retained) return null

  if (error && !dataSources) {
    return (
      <PanelShell target={retained} open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
        <ErrorState error={error} onRetry={() => void reload()} />
      </PanelShell>
    )
  }

  if (!dataSources) {
    return (
      <PanelShell target={retained} open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
        <DetailSkeleton rows={6} />
      </PanelShell>
    )
  }

  return (
    <EditorForm
      key={openCount}
      target={retained}
      open={Boolean(target)}
      sources={dataSources}
      period={period}
      onClose={onClose}
      onApply={onApply}
    />
  )
}

function PanelShell({
  target,
  open,
  onOpenChange,
  children,
}: {
  target: EditorTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(target.kind === "new" ? "customDashboards.editor.newTitle" : "customDashboards.editor.editTitle")}
      size="full"
    >
      {children}
    </ResponsiveDialog>
  )
}

function EditorForm({
  target,
  open,
  sources,
  period,
  onClose,
  onApply,
}: {
  target: EditorTarget
  open: boolean
  sources: DataSourceMeta[]
  period: DashboardPeriod
  onClose: () => void
  onApply: WidgetEditorPanelProps["onApply"]
}) {
  const { t } = useTranslation()
  const formulaMessage = useFormulaErrorMessage()
  const [tab, setTab] = useState<EditorTab>("data")

  const defaults = useMemo<EditorValues>(() => {
    if (target.kind === "new") return target.values
    const key = target.widget.query.dataSource || target.widget.dataSource
    return widgetToEditor(target.widget, sources.find((item) => item.key === key))
  }, [sources, target])

  const schema = useMemo(
    () => buildSchema(t, (error) => (error ? formulaMessage(error) : "")),
    [formulaMessage, t]
  )
  const form = useForm<EditorValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: "onBlur" })

  const values = useWatch({ control: form.control }) as EditorValues
  const source = sources.find((item) => item.key === values.dataSource)
  const { filterOptions } = useFilterOptions(values.dataSource)

  const customLabel = (field: string) =>
    filterOptions?.custom_attributes?.find((item) => `custom_attributes.${item.value}` === field)?.label

  const sentence = describeEditor(values, sources, customLabel, t)
  const suggestedTitle = describeEditor(values, sources, customLabel, t, { asTitle: true })

  // O título sugerido acompanha as escolhas até a pessoa escrever o dela.
  const titleTouched = useRef(target.kind === "edit" || Boolean(defaults.title.trim()))
  useEffect(() => {
    if (titleTouched.current || !suggestedTitle) return
    form.setValue("title", suggestedTitle, { shouldValidate: form.formState.isSubmitted })
  }, [form, suggestedTitle])

  const titleDirty = form.formState.dirtyFields.title
  useEffect(() => {
    if (titleDirty && document.activeElement?.getAttribute("name") === "title") titleTouched.current = true
  }, [titleDirty, values.title])

  const close = useGuardedClose(form.formState.isDirty, onClose)

  const widgetId = target.kind === "edit" ? target.widget.id : null
  const built = useMemo(() => editorToWidget(values, source), [source, values])
  const preview = usePreviewWidget(built, target, widgetId)

  const submit = useFormSubmit(form, (submitted) => {
    const submittedSource = sources.find((item) => item.key === submitted.dataSource)
    const result = editorToWidget(submitted, submittedSource)
    const layout: WidgetLayout =
      target.kind === "edit" ? target.widget.layout : { x: 0, y: 0, ...target.size }
    onApply({ id: target.kind === "edit" ? target.widget.id : newWidgetId(), layout, ...result }, target)
    onClose()
  })

  const showRules = hasRules(values)
  const submitWithFeedback = (event: React.FormEvent<HTMLFormElement>) => {
    void form.trigger().then((valid) => {
      if (!valid) setTab(tabOfError(form.formState.errors))
    })
    return submit(event)
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      title={t(target.kind === "new" ? "customDashboards.editor.newTitle" : "customDashboards.editor.editTitle")}
      description={sentence || undefined}
      size="full"
      onSubmit={submitWithFeedback}
      bodyClassName="p-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:overflow-hidden"
      footer={
        <FormActions
          form={form}
          submitLabel={t(target.kind === "new" ? "customDashboards.editor.add" : "customDashboards.editor.apply")}
          onCancel={onClose}
        />
      }
    >
      <FormProvider {...form}>
        {/* Em telas estreitas, a prévia aparece antes dos campos: é o resultado que orienta a escolha. No DOM, os campos vêm
            primeiro: é neles que o teclado começa. */}
        <div className="flex min-h-full flex-col lg:contents">
          <div className="order-2 min-w-0 flex-1 p-4 lg:order-none lg:overflow-y-auto">
            <Tabs value={tab} onValueChange={(next) => setTab(next as EditorTab)} className="gap-4">
              <TabsList variant="line" aria-label={t("customDashboards.editor.sections")} className="justify-start p-0 group-data-horizontal/tabs:h-9">
                <TabsTrigger value="data" className="h-9 flex-none px-2.5 after:bg-primary group-data-horizontal/tabs:after:bottom-0">
                  {t("customDashboards.editor.tabData")}
                </TabsTrigger>
                <TabsTrigger value="appearance" className="h-9 flex-none px-2.5 after:bg-primary group-data-horizontal/tabs:after:bottom-0">
                  {t("customDashboards.editor.tabAppearance")}
                </TabsTrigger>
                {showRules ? (
                  <TabsTrigger value="rules" className="h-9 flex-none px-2.5 after:bg-primary group-data-horizontal/tabs:after:bottom-0">
                    {t("customDashboards.editor.tabRules")}
                  </TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="data">
                <DataSection sources={sources} />
              </TabsContent>
              <TabsContent value="appearance">
                <AppearanceSection />
              </TabsContent>
              {showRules ? (
                <TabsContent value="rules">
                  <RulesSection sources={sources} />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>

          <div className="order-1 border-b bg-muted/30 p-4 lg:order-none lg:border-b-0 lg:border-l">
            <EditorPreview widget={preview} period={period} sources={sources} />
          </div>
        </div>
      </FormProvider>
    </ResponsiveDialog>
  )
}

/**
 * O card da prévia. A aparência responde na hora; a consulta espera a pessoa parar de digitar, e só muda de identidade
 * quando muda de conteúdo. Ajustar uma cor não pergunta nada ao servidor, e digitar um filtro não pergunta a cada letra.
 */
function usePreviewWidget(
  built: ReturnType<typeof editorToWidget>,
  target: EditorTarget,
  widgetId: string | null
): DashboardWidget {
  const queryText = useDebouncedValue(JSON.stringify(built.query), QUERY_DEBOUNCE)
  const query = useMemo<WidgetQuery>(() => JSON.parse(queryText) as WidgetQuery, [queryText])
  const size = target.kind === "edit" ? target.widget.layout : { x: 0, y: 0, ...target.size }

  return useMemo(
    () => ({
      ...built,
      query,
      id: widgetId ?? "preview",
      layout: { x: 0, y: 0, w: size.w, h: size.h },
      position: 0,
    }),
    [built, query, size.h, size.w, widgetId]
  )
}

function EditorPreview({ widget, period, sources }: { widget: DashboardWidget; period: DashboardPeriod; sources: DataSourceMeta[] }) {
  const { t } = useTranslation()
  const form = useFormContext<EditorValues>()
  const height = Math.min(MAX_PREVIEW_HEIGHT, widget.layout.h * GRID_ROW_HEIGHT + (widget.layout.h - 1) * GRID_MARGIN)
  const view = useWidgetView(widget, period)

  // A forma que a pessoa escolheu não ajuda com tantas partes: sugere, sem trocar sozinho.
  const tooManyParts =
    (widget.widgetType === "pie_chart" || widget.widgetType === "donut_chart") && (view.chart?.categories.length ?? 0) > MAX_SLICES

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-0">
      <p className="text-xs font-medium text-muted-foreground">{t("customDashboards.editor.preview")}</p>
      <div style={{ height }}>
        <WidgetCard widget={widget} period={period} presentation="preview" />
      </div>
      {tooManyParts ? (
        <Callout
          tone="neutral"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const values = form.getValues()
                form.reset(adaptToType(values, "bar_chart", sources.find((item) => item.key === values.dataSource)), { keepDefaultValues: true })
                form.setValue("widgetType", "bar_chart", { shouldDirty: true })
              }}
            >
              {t("customDashboards.editor.useBars")}
            </Button>
          }
        >
          {t("customDashboards.editor.tooManyParts", { count: view.chart?.categories.length ?? 0 })}
        </Callout>
      ) : null}
    </div>
  )
}
