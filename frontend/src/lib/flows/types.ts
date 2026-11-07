import type { PaginationMeta } from "@/lib/api"

// O contrato da API de fluxos (docs/migration/api/automation.md). A definição é mapa livre e passa
// intacta: as conexões são camelCase, como no xyflow, e o `data` de cada bloco é snake_case.

export type FlowStatus = "draft" | "published" | "archived"

export const FLOW_TRIGGER_TYPES = [
  "message_received",
  "first_message",
  "keyword",
  "contact_created",
  "human_handoff",
  "manual",
  "webhook",
] as const
export type FlowTriggerType = (typeof FLOW_TRIGGER_TYPES)[number]

export type FlowExecutionStatus =
  | "pending"
  | "running"
  | "waiting"
  | "waiting_for_message"
  | "completed"
  | "failed"
  | "cancelled"

export type FlowStats = {
  lastExecutedAt: number
  /** Os últimos resultados, do mais novo para o mais antigo. */
  recent: FlowExecutionStatus[]
  last7Days: { total: number; failed: number; waiting: number }
}

export type FlowSummary = {
  id: string
  name: string
  description: string | null
  status: FlowStatus
  triggerType: FlowTriggerType
  connectorFilter: { connectorIds: string[] }
  published: boolean
  updatedAt: number
  createdAt: number
  /** Só na lista. Fluxo que nunca rodou vem sem. */
  stats?: FlowStats | null
}

export type BlockData = Record<string, unknown>

export type DefinitionNode = {
  id: string
  type: string
  position?: { x: number; y: number }
  data?: BlockData
}

export type DefinitionEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
}

export type FlowFieldType = "string" | "integer" | "number" | "boolean" | "array"

/** O que o fluxo coleta em cada conversa: cadastrado uma vez e usado pelos blocos que preenchem. */
export type FlowField = {
  key: string
  label: string
  type: FlowFieldType
  description?: string
}

export type FlowDefinition = {
  nodes: DefinitionNode[]
  edges: DefinitionEdge[]
  viewport?: { x?: number; y?: number; zoom?: number }
  fields?: FlowField[]
  base_prompt?: string
}

export type FlowVersion = {
  id: string
  versionNumber: number
  definition: FlowDefinition
  publishedAt: number | null
  updatedAt: number
}

export type FlowVersionSummary = Omit<FlowVersion, "definition">

export type FlowDetail = FlowSummary & {
  draft: FlowVersion | null
  publishedVersion: FlowVersion | null
}

export type FlowTemplate = {
  slug: string
  name: string
  description: string
  category: string
  triggerType: FlowTriggerType
  tags: string[]
  thumbnailUrl: string
  definition: FlowDefinition
}

export type PublishIssueCode =
  | "noTrigger"
  | "multipleTriggers"
  | "unknownBlock"
  | "missingNodeId"
  | "duplicatedNodeId"
  | "brokenEdge"

export type ServerPublishIssue = {
  code: PublishIssueCode
  nodeId?: string
  edgeId?: string
  type?: string
}

export type FlowExecution = {
  id: string
  flowId: string
  status: FlowExecutionStatus
  chatId: string | null
  contactId: string | null
  contactName?: string | null
  currentNodeId: string | null
  startedAt: number | null
  completedAt: number | null
}

export type FlowExecutionLog = {
  id: string
  nodeId: string
  nodeType: string
  status: "success" | "error" | "skipped" | "suspended"
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  durationMs: number | null
  executedAt: number
  errorMessage: string | null
}

export type FlowExecutionDetail = FlowExecution & {
  context: Record<string, unknown>
  errorMessage: string | null
  logs: FlowExecutionLog[]
}

export type ExecutionsResponse = {
  executions: FlowExecution[]
  counts?: Partial<Record<FlowExecutionStatus, number>>
  meta: PaginationMeta
}

/* ---------- Teste do editor: `FlowPlaygroundChannel` ---------- */

export type PlaygroundMessage =
  | { kind: "node_entered"; nodeId: string; nodeType: string; at: string }
  | {
      kind: "node_completed"
      nodeId: string
      nodeType: string
      status: "success" | "suspended" | "error"
      durationMs?: number
      error?: string
      at: string
    }
  | { kind: "text"; body: string; sender: string | null; at: string }
  | { kind: "media"; attachmentId: string | null; url: string | null; caption: string | null; at: string }
  | { kind: "event"; name: string; payload: Record<string, unknown> | null; at: string }
  | {
      kind: "ai_decision"
      nodeId: string
      decision: string
      label: string | null
      reason: string | null
      turn: number | null
      at: string
    }
  | { kind: "suspended"; status: "waiting" | "waiting_for_message"; currentNodeId: string | null; at: string }
  | { kind: "completed"; at: string }
  | { kind: "failed"; message: string | null; at: string }
  | { kind: "stopped"; at: string }
  | { kind: "user_message"; body: string; at: string }

/* ---------- O que um bloco escolhe ---------- */

export type ToolSummary = {
  id: string
  name: string
  description: string | null
  toolInstallationId: string | null
  tool: { id: string; name: string } | null
}

export type ToolParameter = {
  name: string
  type: string
  description?: string
  required?: boolean
  enum?: string[]
  itemsType?: string
  itemsProperties?: ToolParameter[]
  minItems?: number
  properties?: ToolParameter[]
  default?: unknown
}

export type ToolDetail = ToolSummary & {
  jsCode?: string
  parameters: ToolParameter[]
  parametersJson?: string
  locked: boolean
  createdAt: number
  updatedAt: number
}

export type ToolTestRun = {
  id: string
  status: "pending" | "done" | "failed"
  response?: unknown
  error?: string
  events?: { name: string; input?: unknown; output?: unknown; caller_line?: number }[]
  durationMs?: number
}

export type PipelineStageOption = { id: string; name: string; position: number }

export type PipelineBoardOption = {
  id: string
  name: string
  archived: boolean
  stages: PipelineStageOption[]
}

export type PipelineCustomField = {
  id: string
  key: string
  name: string
  fieldType: string
  options: string[] | null
}

export type PipelineLabel = { id: string; name: string; color: string | null }

/* ---------- `/automation-settings` ---------- */

export type BusinessDay = {
  dayOfWeek: string
  enabled: string | boolean
  windows: { start: string; end: string }[]
}

export type AutomationSettings = {
  automationEnabled: boolean
  defaultAutomationEnabled: boolean
  automationPausePeriod: "disabled" | "minutes" | "hours" | "days"
  automationPauseTimeTo: number
  businessWorkEnabled: boolean
  businessWork: { days?: BusinessDay[] }
  autoClearContextEnabled: boolean
  autoClearContextInterval: number
  timezone: string
}
