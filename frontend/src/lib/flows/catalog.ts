import type { LucideIcon } from "lucide-react"
import {
  Archive,
  ArrowRightLeft,
  BadgeCheck,
  BadgeX,
  Binary,
  Bot,
  Braces,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CirclePause,
  CirclePlay,
  ClipboardCheck,
  Clock,
  Code2,
  Compass,
  FileText,
  Filter,
  Flag,
  Globe,
  GitBranch,
  GitFork,
  Hand,
  Headphones,
  HelpCircle,
  KeyRound,
  LayoutList,
  Link2,
  ListChecks,
  ListTree,
  MessageCircle,
  MessageCirclePlus,
  MessageSquareDashed,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Paperclip,
  Pencil,
  Play,
  Repeat,
  RotateCcw,
  ScanSearch,
  Search,
  SmilePlus,
  SquarePen,
  SquarePlus,
  StickyNote,
  Tag,
  TagsIcon,
  Timer,
  UserPlus,
  UserRoundCheck,
  Variable,
  Webhook,
  Zap,
} from "lucide-react"

import type { BlockData, FlowTriggerType } from "./types"

// O catálogo dos 52 blocos: é o contrato de `docs/migration/api/automation.md`, e o editor nasce
// daqui. Título, descrição e palavras de busca moram em `locales/*/flows.json`, em
// `flows.blocks.<tipo>`. Os grupos seguem o que a pessoa quer fazer, e não a categoria técnica do motor.

/** O que a cor do ícone distingue. Poucas famílias, para o quadro não virar arco-íris. */
export type BlockFamily = "start" | "talk" | "ai" | "decide" | "neutral"

export const BLOCK_GROUPS = [
  "start",
  "talk",
  "ai",
  "decide",
  "organize",
  "pipeline",
  "connect",
  "finish",
] as const
export type BlockGroup = (typeof BLOCK_GROUPS)[number]

const GROUP_FAMILY: Record<BlockGroup, BlockFamily> = {
  start: "start",
  talk: "talk",
  ai: "ai",
  decide: "decide",
  organize: "neutral",
  pipeline: "neutral",
  connect: "neutral",
  finish: "neutral",
}

export type BlockEntry = {
  type: string
  group: BlockGroup
  icon: LucideIcon
  /** O que o bloco nasce preenchendo. */
  defaults: () => BlockData
  /** Saídas fixas, além das que vêm do `data`. Sem isto, a saída padrão. */
  outputs?: { id: string; labelKey: string; tone?: "danger" }[]
  /** Aceita a saída `onError`. */
  errorOutput?: boolean
  /** Sem saída: termina o fluxo aqui. */
  terminal?: boolean
}

const noData = () => ({})

const pipelineEntry = (
  type: string,
  icon: LucideIcon,
  defaults: () => BlockData,
  errorOutput = true
): BlockEntry => ({ type, group: "pipeline", icon, defaults, errorOutput })

const trigger = (type: string, icon: LucideIcon, defaults: () => BlockData = noData): BlockEntry => ({
  type,
  group: "start",
  icon,
  defaults,
})

export const BLOCK_CATALOG: BlockEntry[] = [
  trigger("trigger_message_received", MessageCircle),
  trigger("trigger_first_message", MessageCirclePlus),
  trigger("trigger_keyword", KeyRound, () => ({ keywords: [] })),
  trigger("trigger_contact_created", UserPlus),
  trigger("trigger_human_handoff", Hand),
  trigger("trigger_manual", Play),
  trigger("trigger_webhook", Webhook),

  { type: "send_text", group: "talk", icon: MessageSquareText, defaults: () => ({ text: "" }) },
  { type: "ask_question", group: "talk", icon: HelpCircle, defaults: () => ({ text: "", save_to: "" }) },
  { type: "send_interactive", group: "talk", icon: LayoutList, defaults: () => ({ text: "", buttons: [] }) },
  { type: "send_media", group: "talk", icon: Paperclip, defaults: () => ({ attachment_id: null, caption: "" }) },
  { type: "send_template", group: "talk", icon: FileText, defaults: () => ({ template_name: "", parameters: [] }) },

  {
    type: "ai_assistant",
    group: "ai",
    icon: Bot,
    defaults: () => ({
      mode: "interactive",
      system_prompt: "",
      model_size: "main",
      use_history: true,
      tool_ids: [],
      min_turns: 1,
      outputs: [],
    }),
    errorOutput: true,
  },
  {
    type: "ai_intent_classification",
    group: "ai",
    icon: Compass,
    defaults: () => ({ system_prompt: "", outputs: [] }),
    errorOutput: true,
  },
  {
    type: "ai_sentiment",
    group: "ai",
    icon: SmilePlus,
    defaults: () => ({
      outputs: [
        { id: "positive", label: "" },
        { id: "neutral", label: "" },
        { id: "negative", label: "" },
      ],
    }),
    errorOutput: true,
  },
  {
    type: "ai_parameter_extractor",
    group: "ai",
    icon: ScanSearch,
    defaults: () => ({ system_prompt: "", model_size: "main", fields: [] }),
    errorOutput: true,
  },
  { type: "ai_audio_transcription", group: "ai", icon: Mic, defaults: () => ({ save_to: "" }), errorOutput: true },

  {
    type: "condition",
    group: "decide",
    icon: GitBranch,
    defaults: () => ({ match: "all", rules: [{ field: "", operator: "contains", value: "" }] }),
    outputs: [
      { id: "true", labelKey: "flows.outputs.true" },
      { id: "false", labelKey: "flows.outputs.false" },
    ],
  },
  { type: "switch", group: "decide", icon: GitFork, defaults: () => ({ field: "", cases: [] }) },
  { type: "wait", group: "decide", icon: Timer, defaults: () => ({ amount: 5, unit: "minutes" }) },
  { type: "wait_for_message", group: "decide", icon: MessageSquareDashed, defaults: () => ({ save_to: "" }) },
  {
    type: "loop",
    group: "decide",
    icon: Repeat,
    defaults: () => ({ source: "", loop_variable: "item", index_variable: "index", max_iterations: 100 }),
    outputs: [
      { id: "each", labelKey: "flows.outputs.each" },
      { id: "done", labelKey: "flows.outputs.done" },
    ],
  },
  { type: "set_variable", group: "decide", icon: Variable, defaults: () => ({ assignments: [] }) },

  { type: "add_tag", group: "organize", icon: Tag, defaults: () => ({ tag_id: "", tag_name: "" }) },
  { type: "remove_tag", group: "organize", icon: TagsIcon, defaults: () => ({ tag_id: "", tag_name: "" }) },
  { type: "set_custom_attribute", group: "organize", icon: SquarePen, defaults: () => ({ key: "", value: "" }) },
  { type: "assign_agent", group: "organize", icon: UserRoundCheck, defaults: () => ({ account_id: "", account_pool: [] }) },
  { type: "assign_team", group: "organize", icon: Building2, defaults: () => ({ team_id: "" }) },
  { type: "transfer_to_human", group: "organize", icon: Headphones, defaults: noData },
  { type: "set_funnel_stage", group: "organize", icon: Filter, defaults: () => ({ funnel_id: "", stage_id: "" }) },
  { type: "pause_automation", group: "organize", icon: CirclePause, defaults: noData },
  { type: "resume_automation", group: "organize", icon: CirclePlay, defaults: noData },

  pipelineEntry("pipeline_create_card", SquarePlus, () => ({
    board_id: "",
    stage_id: "",
    title: "",
    description: "",
    priority: "",
    link_chat: true,
    reuse_existing: true,
  })),
  pipelineEntry("pipeline_move_card", ArrowRightLeft, () => ({ card_source: null, stage_id: "", position: "top" })),
  pipelineEntry("pipeline_update_card", Pencil, () => ({ card_source: null })),
  pipelineEntry("pipeline_set_custom_field", Binary, () => ({ card_source: null, field_key: "", value: "" })),
  pipelineEntry("pipeline_mark_won", BadgeCheck, () => ({ card_source: null })),
  pipelineEntry("pipeline_mark_lost", BadgeX, () => ({ card_source: null, reason: "" })),
  pipelineEntry("pipeline_reopen_deal", RotateCcw, () => ({ card_source: null })),
  pipelineEntry("pipeline_add_label", Tag, () => ({ card_source: null, label: "" })),
  pipelineEntry("pipeline_remove_label", TagsIcon, () => ({ card_source: null, label_id: "" })),
  pipelineEntry("pipeline_add_comment", StickyNote, () => ({ card_source: null, body: "" })),
  pipelineEntry("pipeline_add_checklist", ListChecks, () => ({ card_source: null, name: "", items: [] })),
  pipelineEntry("pipeline_archive_card", Archive, () => ({ card_source: null })),
  pipelineEntry("pipeline_create_deal", CircleDollarSign, () => ({ stage_id: "", title: "" }), false),
  pipelineEntry("pipeline_update_deal", CalendarClock, noData, false),

  {
    type: "http_request",
    group: "connect",
    icon: Globe,
    defaults: () => ({ url: "", method: "GET", headers: [], body: "", timeout: 10, save_response_to: "" }),
    outputs: [
      { id: "success", labelKey: "flows.outputs.success" },
      { id: "error", labelKey: "flows.outputs.error", tone: "danger" },
    ],
  },
  {
    type: "execute_tool",
    group: "connect",
    icon: Code2,
    defaults: () => ({ tool_id: "", params: {}, save_response_to: "" }),
    outputs: [
      { id: "success", labelKey: "flows.outputs.success" },
      { id: "error", labelKey: "flows.outputs.error", tone: "danger" },
    ],
  },
  {
    type: "catalog_search",
    group: "connect",
    icon: Search,
    defaults: () => ({ query: "", limit: 5, save_to: "" }),
    outputs: [
      { id: "found", labelKey: "flows.outputs.found" },
      { id: "not_found", labelKey: "flows.outputs.notFound" },
    ],
  },
  { type: "goto_flow", group: "connect", icon: Link2, defaults: () => ({ target_flow_id: "", merge_variables: true }) },

  { type: "finalize_chat", group: "finish", icon: CheckCircle2, defaults: noData, terminal: true },
  { type: "end", group: "finish", icon: Flag, defaults: noData, terminal: true },
]

const BY_TYPE = new Map(BLOCK_CATALOG.map((entry) => [entry.type, entry]))

export function blockEntry(type: string | undefined): BlockEntry | undefined {
  return type ? BY_TYPE.get(type) : undefined
}

export function blockFamily(type: string | undefined): BlockFamily {
  const entry = blockEntry(type)
  return entry ? GROUP_FAMILY[entry.group] : "neutral"
}

export function blockIcon(type: string | undefined): LucideIcon {
  return blockEntry(type)?.icon ?? Zap
}

export function isTrigger(type: string | undefined): boolean {
  return Boolean(type?.startsWith("trigger_"))
}

export function triggerBlockType(trigger: FlowTriggerType): string {
  return `trigger_${trigger}`
}

export function triggerTypeOf(blockType: string): FlowTriggerType | null {
  return isTrigger(blockType) ? (blockType.replace("trigger_", "") as FlowTriggerType) : null
}

/** O caminho que todo mundo faz: abre o seletor, antes da lista inteira. */
export const POPULAR_BLOCKS = [
  "send_text",
  "ask_question",
  "send_interactive",
  "ai_assistant",
  "condition",
  "transfer_to_human",
]

export const GROUP_ICONS: Record<BlockGroup, LucideIcon> = {
  start: Zap,
  talk: MessagesSquare,
  ai: Bot,
  decide: GitBranch,
  organize: ClipboardCheck,
  pipeline: ListTree,
  connect: Braces,
  finish: Flag,
}

/** Relógio do que espera, em vez do ícone do bloco: usado no histórico. */
export const WAITING_ICON = Clock
