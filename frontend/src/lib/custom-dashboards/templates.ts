import { WIDGET_SPECS } from "./catalog"
import { newWidgetId } from "./layout"
import type {
  CustomDashboardSummary,
  DashboardWidget,
  DataSourceMeta,
  VisualConfig,
  WidgetLayout,
  WidgetMetric,
  WidgetQuery,
  WidgetType,
} from "./types"

// A biblioteca de cards prontos e os modelos de painel. Nada aqui fala língua: `@chave` vira `t()` ao montar o card,
// em `customDashboards.library.labels`, e o texto fica gravado no card, como obra da pessoa.
//
// `widget-templates.ts` e `dashboard-templates.ts` da origem, adaptados. Lá, "criar do modelo" só criava o nome e o
// ícone, sem os cards; e parte das consultas usava campos que a API não tem. Tudo aqui foi conferido em `data-sources`.

export type RecipeCategory = "service" | "agenda" | "performance" | "goals" | "sales" | "campaigns" | "operations"

export type Recipe = {
  id: string
  category: RecipeCategory
  widgetType: WidgetType
  dataSource?: string
  query?: WidgetQuery
  visualConfig?: VisualConfig
  size?: Pick<WidgetLayout, "w" | "h">
}

const count = (label?: string, extra?: Partial<WidgetMetric>): WidgetMetric => ({
  aggregation: "count",
  ...(label ? { label } : {}),
  ...extra,
})

const sum = (field: string, label?: string): WidgetMetric => ({ aggregation: "sum", field, ...(label ? { label } : {}) })

const WON = { field: "deal_status", operator: "eq", value: "won" } as const

export const RECIPES: Recipe[] = [
  /* Atendimento */
  { id: "conversationsTotal", category: "service", widgetType: "kpi", dataSource: "conversations", visualConfig: { compare: true } },
  { id: "conversationsTrend", category: "service", widgetType: "number_trend", dataSource: "conversations", query: { dimensions: [{ field: "created_at", granularity: "day" }] } },
  { id: "conversationsByDay", category: "service", widgetType: "line_chart", dataSource: "conversations", query: { dimensions: [{ field: "created_at", granularity: "day" }] } },
  { id: "conversationsByStatus", category: "service", widgetType: "donut_chart", dataSource: "conversations", query: { dimensions: [{ field: "status" }] } },
  { id: "conversationsByChannel", category: "service", widgetType: "bar_chart", dataSource: "conversations", query: { dimensions: [{ field: "audience_type" }] } },
  {
    id: "conversationsWeeklyByChannel",
    category: "service",
    widgetType: "bar_chart",
    dataSource: "conversations",
    query: { dimensions: [{ field: "created_at", granularity: "week" }, { field: "audience_type" }] },
    visualConfig: { stacked: true },
  },
  {
    id: "conversationsByAgent",
    category: "service",
    widgetType: "table",
    dataSource: "conversations",
    query: {
      dimensions: [{ field: "assigned_account_id" }],
      metrics: [
        count("@conversations"),
        count("@open", { filters: [{ field: "status", operator: "eq", value: "open" }] }),
        sum("unread_messages", "@unread"),
        { label: "@openShare", formula: "ROUND(PERCENT(B, A), 1)" },
      ],
      sort: { field: "@conversations", direction: "desc" },
    },
    visualConfig: { showTotals: true },
  },
  { id: "topTags", category: "service", widgetType: "bar_chart", dataSource: "conversations", query: { dimensions: [{ field: "chat_tag_name" }], limit: 10 } },
  { id: "contactsNew", category: "service", widgetType: "kpi", dataSource: "contacts" },
  { id: "contactsByOrigin", category: "service", widgetType: "bar_chart", dataSource: "contacts", query: { dimensions: [{ field: "contact_origin" }] } },
  {
    id: "latestConversations",
    category: "service",
    widgetType: "table",
    dataSource: "conversations",
    query: { limit: 10, sort: { field: "last_message_at", direction: "desc" } },
    visualConfig: {
      columns: [
        { field: "user_name", label: "" },
        { field: "status", label: "" },
        { field: "audience_type", label: "" },
        { field: "unread_messages", label: "" },
        { field: "last_message_at", label: "" },
      ],
    },
  },

  /* Agenda */
  { id: "bookingsTotal", category: "agenda", widgetType: "kpi", dataSource: "agenda_bookings", query: { metrics: [count()] } },
  { id: "bookingsAttended", category: "agenda", widgetType: "kpi", dataSource: "agenda_bookings", query: { filters: [{ field: "attendance_status", operator: "eq", value: "show" }] } },
  { id: "bookingsCanceled", category: "agenda", widgetType: "kpi", dataSource: "agenda_bookings", query: { filters: [{ field: "status", operator: "eq", value: "canceled" }] }, visualConfig: { goodWhen: "down" } },
  {
    id: "attendanceRate",
    category: "agenda",
    widgetType: "kpi",
    dataSource: "agenda_bookings",
    query: {
      compound: true,
      formula: "PERCENT(A, B)",
      formulaSteps: [
        { id: "A", label: "@attended", dataSource: "agenda_bookings", aggregation: "count", filters: [{ field: "attendance_status", operator: "eq", value: "show" }] },
        { id: "B", label: "@bookings", dataSource: "agenda_bookings", aggregation: "count" },
      ],
    },
    visualConfig: { format: "percent" },
  },
  { id: "bookingsByDay", category: "agenda", widgetType: "bar_chart", dataSource: "agenda_bookings", query: { dimensions: [{ field: "start", granularity: "day" }] } },
  { id: "bookingsByStatus", category: "agenda", widgetType: "funnel", dataSource: "agenda_bookings", query: { dimensions: [{ field: "attendance_status" }] } },
  { id: "bookingsByProfessional", category: "agenda", widgetType: "bar_chart", dataSource: "agenda_bookings", query: { dimensions: [{ field: "professional_name" }] } },

  /* Desempenho */
  { id: "messagesByDay", category: "performance", widgetType: "area_chart", dataSource: "messages", query: { dimensions: [{ field: "created_at", granularity: "day" }] } },
  {
    id: "messagesByAuthor",
    category: "performance",
    widgetType: "line_chart",
    dataSource: "daily_stats",
    query: {
      dimensions: [{ field: "day", granularity: "day" }],
      metrics: [sum("messages_inbound", "@received"), sum("messages_sent_by_automation", "@automation"), sum("messages_sent_by_human", "@team")],
    },
  },
  { id: "automationTrend", category: "performance", widgetType: "number_trend", dataSource: "daily_stats", query: { metrics: [sum("automation_chats")], dimensions: [{ field: "day", granularity: "day" }] } },
  { id: "hoursSaved", category: "performance", widgetType: "kpi", dataSource: "daily_stats", query: { metrics: [sum("hours_saved")] }, visualConfig: { suffix: " h", decimalPrecision: 1 } },
  {
    id: "firstResponse",
    category: "performance",
    widgetType: "kpi",
    dataSource: "daily_stats",
    query: {
      compound: true,
      formula: "A / B",
      formulaSteps: [
        { id: "A", label: "@responseSeconds", dataSource: "daily_stats", aggregation: "sum", metric: "first_response_human_seconds_sum" },
        { id: "B", label: "@responses", dataSource: "daily_stats", aggregation: "sum", metric: "first_response_human_count" },
      ],
    },
    visualConfig: { format: "duration", goodWhen: "down" },
  },
  {
    id: "automationShare",
    category: "performance",
    widgetType: "kpi",
    dataSource: "daily_stats",
    query: {
      compound: true,
      formula: "PERCENT(A, B)",
      formulaSteps: [
        { id: "A", label: "@resolved", dataSource: "daily_stats", aggregation: "sum", metric: "chats_handled_by_automation" },
        { id: "B", label: "@started", dataSource: "daily_stats", aggregation: "sum", metric: "chats_started" },
      ],
    },
    visualConfig: { format: "percent" },
  },

  /* Metas */
  {
    id: "goalConversations",
    category: "goals",
    widgetType: "gauge",
    dataSource: "conversations",
    visualConfig: {
      goalValue: 500,
      goalLabel: "@monthlyGoal",
      conditionalRules: [
        { operator: "gte", value: 80, color: "tone-success" },
        { operator: "gte", value: 50, color: "tone-warning" },
        { operator: "lt", value: 50, color: "tone-danger" },
      ],
    },
  },
  { id: "goalBookings", category: "goals", widgetType: "progress_bar", dataSource: "agenda_bookings", visualConfig: { goalValue: 200, goalLabel: "@monthlyGoal" } },
  {
    id: "goalSales",
    category: "goals",
    widgetType: "progress_bar",
    dataSource: "pipelines",
    query: { metrics: [sum("deal_value")], filters: [WON], timeRange: { field: "won_at" } },
    visualConfig: { goalValue: 50000, goalLabel: "@monthlyGoal", format: "currency" },
  },

  /* Vendas */
  { id: "wonValue", category: "sales", widgetType: "kpi", dataSource: "pipelines", query: { metrics: [sum("deal_value")], filters: [WON], timeRange: { field: "won_at" } }, visualConfig: { format: "currency" } },
  { id: "openValue", category: "sales", widgetType: "kpi", dataSource: "pipelines", query: { metrics: [sum("deal_value")], filters: [{ field: "deal_status", operator: "eq", value: "open" }] }, visualConfig: { format: "currency" } },
  {
    id: "winRate",
    category: "sales",
    widgetType: "kpi",
    dataSource: "pipelines",
    query: {
      compound: true,
      formula: "PERCENT(A, A + B)",
      formulaSteps: [
        { id: "A", label: "@won", dataSource: "pipelines", aggregation: "count", filters: [WON] },
        { id: "B", label: "@lost", dataSource: "pipelines", aggregation: "count", filters: [{ field: "deal_status", operator: "eq", value: "lost" }] },
      ],
    },
    visualConfig: { format: "percent" },
  },
  { id: "dealsByStatus", category: "sales", widgetType: "donut_chart", dataSource: "pipelines", query: { dimensions: [{ field: "deal_status" }] } },
  { id: "cardsByStage", category: "sales", widgetType: "funnel", dataSource: "pipelines", query: { dimensions: [{ field: "stage_id" }], filters: [{ field: "archived", operator: "eq", value: "false" }] } },
  { id: "valueByStage", category: "sales", widgetType: "bar_chart", dataSource: "pipelines", query: { metrics: [sum("deal_value")], dimensions: [{ field: "stage_id" }] }, visualConfig: { format: "currency" } },
  { id: "wonByMonth", category: "sales", widgetType: "bar_chart", dataSource: "pipelines", query: { metrics: [sum("deal_value")], dimensions: [{ field: "won_at", granularity: "month" }], filters: [WON] }, visualConfig: { format: "currency" } },

  /* Campanhas */
  { id: "campaignsSent", category: "campaigns", widgetType: "kpi", dataSource: "campaigns", query: { metrics: [sum("sent_count")] } },
  {
    id: "campaignReadRate",
    category: "campaigns",
    widgetType: "kpi",
    dataSource: "campaigns",
    query: {
      compound: true,
      formula: "PERCENT(A, B)",
      formulaSteps: [
        { id: "A", label: "@read", dataSource: "campaigns", aggregation: "sum", metric: "read_count" },
        { id: "B", label: "@delivered", dataSource: "campaigns", aggregation: "sum", metric: "delivered_count" },
      ],
    },
    visualConfig: { format: "percent" },
  },
  {
    id: "campaignFunnel",
    category: "campaigns",
    widgetType: "funnel",
    dataSource: "campaigns",
    query: {
      metrics: [
        sum("recipients_count", "@recipients"),
        sum("sent_count", "@sent"),
        sum("delivered_count", "@delivered"),
        sum("read_count", "@read"),
      ],
    },
  },

  /* Operação */
  { id: "webhookErrors", category: "operations", widgetType: "kpi", dataSource: "hook_logs", query: { filters: [{ field: "status", operator: "eq", value: "error" }] }, visualConfig: { goodWhen: "down", conditionalRules: [{ operator: "gt", value: 0, color: "tone-danger" }] } },
  { id: "webhooksByStatus", category: "operations", widgetType: "donut_chart", dataSource: "hook_logs", query: { dimensions: [{ field: "status" }] } },
  { id: "webhookTime", category: "operations", widgetType: "line_chart", dataSource: "hook_logs", query: { metrics: [{ aggregation: "avg", field: "processing_time_ms" }], dimensions: [{ field: "created_at", granularity: "day" }] }, visualConfig: { suffix: " ms" } },
  {
    id: "latestWebhooks",
    category: "operations",
    widgetType: "table",
    dataSource: "hook_logs",
    query: { limit: 20, sort: { field: "created_at", direction: "desc" } },
  },
  { id: "note", category: "operations", widgetType: "rich_text", visualConfig: { content: "@noteContent" }, size: { w: 6, h: 2 } },
  { id: "section", category: "operations", widgetType: "section_divider" },
]

export const RECIPE_CATEGORIES: RecipeCategory[] = ["service", "agenda", "performance", "goals", "sales", "campaigns", "operations"]

type TemplateItem = { recipe: string; layout: WidgetLayout }

export type DashboardTemplate = {
  id: string
  icon: string
  items: TemplateItem[]
}

const at = (recipe: string, x: number, y: number, w: number, h: number): TemplateItem => ({ recipe, layout: { x, y, w, h } })

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "service",
    icon: "message",
    items: [
      at("conversationsTotal", 0, 0, 3, 2),
      at("contactsNew", 3, 0, 3, 2),
      at("firstResponse", 6, 0, 3, 2),
      at("automationShare", 9, 0, 3, 2),
      at("conversationsWeeklyByChannel", 0, 2, 8, 4),
      at("conversationsByStatus", 8, 2, 4, 4),
      at("conversationsByAgent", 0, 6, 12, 5),
    ],
  },
  {
    id: "agenda",
    icon: "calendar",
    items: [
      at("bookingsTotal", 0, 0, 3, 2),
      at("bookingsAttended", 3, 0, 3, 2),
      at("bookingsCanceled", 6, 0, 3, 2),
      at("attendanceRate", 9, 0, 3, 2),
      at("bookingsByDay", 0, 2, 8, 4),
      at("bookingsByProfessional", 8, 2, 4, 4),
    ],
  },
  {
    id: "automation",
    icon: "bolt",
    items: [
      at("automationTrend", 0, 0, 4, 2),
      at("automationShare", 4, 0, 4, 2),
      at("hoursSaved", 8, 0, 4, 2),
      at("messagesByAuthor", 0, 2, 8, 4),
      at("topTags", 8, 2, 4, 4),
    ],
  },
  {
    id: "sales",
    icon: "money",
    items: [
      at("wonValue", 0, 0, 3, 2),
      at("openValue", 3, 0, 3, 2),
      at("winRate", 6, 0, 3, 2),
      at("goalSales", 9, 0, 3, 2),
      at("wonByMonth", 0, 2, 7, 4),
      at("cardsByStage", 7, 2, 5, 4),
      at("valueByStage", 0, 6, 12, 4),
    ],
  },
  {
    id: "operations",
    icon: "chart",
    items: [
      at("messagesByDay", 0, 0, 8, 4),
      at("webhookErrors", 8, 0, 4, 2),
      at("hoursSaved", 8, 2, 4, 2),
      at("latestWebhooks", 0, 4, 12, 5),
    ],
  },
]

export type Translate = (key: string, options?: Record<string, unknown>) => string

function resolveLabel(value: string | undefined, t: Translate): string | undefined {
  return value?.startsWith("@") ? t(`customDashboards.library.labels.${value.slice(1)}`) : value
}

function resolveQuery(query: WidgetQuery, dataSource: string | undefined, t: Translate): WidgetQuery {
  return {
    ...query,
    ...(dataSource ? { dataSource } : {}),
    ...(query.metrics ? { metrics: query.metrics.map((metric) => ({ ...metric, label: resolveLabel(metric.label, t) })) } : {}),
    ...(query.formulaSteps
      ? { formulaSteps: query.formulaSteps.map((step) => ({ ...step, label: resolveLabel(step.label, t) ?? step.id })) }
      : {}),
    ...(query.sort ? { sort: { ...query.sort, field: resolveLabel(query.sort.field, t) ?? query.sort.field } } : {}),
  }
}

/** Monta um card da biblioteca, no idioma de quem está adicionando. */
export function instantiateRecipe(recipe: Recipe, t: Translate, layout?: WidgetLayout): Omit<DashboardWidget, "position"> {
  const spec = WIDGET_SPECS[recipe.widgetType]
  const visual = recipe.visualConfig ?? {}
  const title = t(`customDashboards.library.items.${recipe.id}.title`)

  return {
    id: newWidgetId(),
    widgetType: recipe.widgetType,
    title,
    dataSource: recipe.dataSource ?? null,
    query: resolveQuery(recipe.query ?? {}, recipe.dataSource, t),
    visualConfig: {
      ...visual,
      ...(visual.goalLabel ? { goalLabel: resolveLabel(visual.goalLabel, t) } : {}),
      ...(visual.content ? { content: resolveLabel(visual.content, t) } : {}),
    },
    layout: layout ?? { x: 0, y: 0, ...(recipe.size ?? spec.size) },
  }
}

/** A fonte que o card precisa alcançar. Fórmula precisa de todas. */
function recipeSources(recipe: Recipe): string[] {
  const steps = recipe.query?.formulaSteps?.map((step) => step.dataSource) ?? []
  return [...new Set([...(recipe.dataSource ? [recipe.dataSource] : []), ...steps])]
}

export function recipeAvailable(recipe: Recipe, sources: DataSourceMeta[]): boolean {
  return recipeSources(recipe).every((key) => sources.some((source) => source.key === key))
}

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id)
}

/** O que do modelo esta pessoa alcança: o card de uma fonte fechada para ela ficaria sempre em "sem acesso". */
export function templateItems(template: DashboardTemplate, sources: DataSourceMeta[]) {
  return template.items.flatMap((item) => {
    const recipe = findRecipe(item.recipe)
    return recipe && recipeAvailable(recipe, sources) ? [{ recipe, layout: item.layout }] : []
  })
}

export function instantiateTemplate(
  template: DashboardTemplate,
  sources: DataSourceMeta[],
  t: Translate
): Omit<DashboardWidget, "position">[] {
  return templateItems(template, sources).map(({ recipe, layout }) => instantiateRecipe(recipe, t, layout))
}

/** Favoritos primeiro, depois do mais antigo para o mais novo. Salvar não embaralha as abas. */
export function sortDashboards<T extends Pick<CustomDashboardSummary, "isFavorite" | "createdAt">>(list: T[]): T[] {
  return [...list].sort((left, right) => Number(right.isFavorite) - Number(left.isFavorite) || left.createdAt - right.createdAt)
}
