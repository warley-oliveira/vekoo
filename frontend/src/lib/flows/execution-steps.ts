import type { TFunction } from "i18next"

import type { StatusTone } from "@/components/shared"

import type { FlowExecutionLog, FlowExecutionStatus } from "./types"
import { humanizeVariables } from "./variables"

// O passo a passo legível de uma execução. O log do motor é técnico (`input`, `output`); aqui ele vira
// uma frase, do jeito que alguém contaria o que aconteceu. O dado cru continua à mão em "Ver detalhes".

export type ExecutionStep = {
  title: string
  detail?: string
  tone: StatusTone
}

const str = (value: unknown): string => (value == null ? "" : String(value))
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export const EXECUTION_TONES: Record<FlowExecutionStatus, StatusTone> = {
  pending: "neutral",
  running: "info",
  waiting: "warning",
  waiting_for_message: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
}

/** Tudo que continua vivo: é o que a tela mostra como "em andamento". */
export const ACTIVE_STATUSES: FlowExecutionStatus[] = ["pending", "running", "waiting", "waiting_for_message"]

export function describeStep(log: FlowExecutionLog, t: TFunction): ExecutionStep {
  const key = (name: string, params?: Record<string, unknown>) => t(`flows.steps.${name}`, params)
  const output = obj(log.output)
  const input = obj(log.input)
  const human = (value: unknown) => humanizeVariables(str(value), t)

  if (log.status === "error" || log.errorMessage) {
    return {
      title: key("failed"),
      detail: log.errorMessage ?? str(output.error),
      tone: "danger",
    }
  }

  if (output.skipped) {
    const reason = str(output.skipped)
    return {
      title: key("skipped"),
      detail: t(`flows.steps.skippedReason.${reason.split(":")[0]}`, { defaultValue: reason }),
      tone: "neutral",
    }
  }

  if (output.error) {
    return { title: key("failedKept"), detail: str(output.error), tone: "warning" }
  }

  const type = log.nodeType
  if (type.startsWith("trigger_")) return { title: key("started"), tone: "neutral" }

  switch (type) {
    case "send_text": {
      const missing = output.missing_attachments as unknown[] | undefined
      return {
        title: key("sent"),
        detail: str(output.sent),
        tone: missing?.length ? "warning" : "success",
      }
    }
    case "ask_question":
      return log.status === "suspended"
        ? { title: key("asked"), detail: str(output.asked), tone: "warning" }
        : { title: key("answered"), detail: str(output.answer), tone: "success" }
    case "send_interactive":
      if (log.status === "suspended") {
        return output.invalid
          ? { title: key("invalidChoice"), detail: str(input.reply), tone: "warning" }
          : { title: key("offered"), detail: str(output.sent), tone: "warning" }
      }
      return { title: key("chose"), detail: str(input.reply), tone: "success" }
    case "send_media":
      return output.status === "failed"
        ? { title: key("mediaFailed"), detail: str(output.error), tone: "warning" }
        : { title: key("mediaSent"), detail: str(input.caption) || str(input.media_url), tone: "success" }
    case "send_template":
      return { title: key("templateSent"), detail: str(output.sent), tone: "success" }
    case "wait":
      return { title: key("waited"), tone: "warning" }
    case "wait_for_message":
      return log.status === "suspended"
        ? { title: key("waitingMessage"), tone: "warning" }
        : { title: key("receivedMessage"), detail: str(output.received), tone: "success" }
    case "condition":
      return { title: output.passed ? key("conditionTrue") : key("conditionFalse"), tone: "neutral" }
    case "switch":
      return { title: key("switched"), detail: str(input.value), tone: "neutral" }
    case "set_variable":
      return { title: key("saved"), detail: Object.keys(obj(output.variables)).join(", "), tone: "neutral" }
    case "loop":
      return output.done
        ? { title: key("loopDone"), tone: "neutral" }
        : { title: key("loopRound", { count: Number(output.index ?? 0) + 1 }), tone: "neutral" }
    case "ai_assistant": {
      if (output.decision && output.decision !== "stay" && log.status !== "suspended") {
        return { title: key("aiLeft"), detail: str(output.reason), tone: "success" }
      }
      if (log.status === "suspended") {
        return { title: key("aiReplied"), detail: str(output.reply), tone: "warning" }
      }
      return { title: key("aiDecided"), detail: str(output.decision), tone: "success" }
    }
    case "ai_sentiment":
      return { title: key("sentiment"), detail: str(output.sentiment), tone: "neutral" }
    case "ai_intent_classification":
      return { title: key("intent"), detail: str(output.intent), tone: "neutral" }
    case "ai_parameter_extractor":
      return {
        title: key("extracted"),
        detail: Object.entries(output)
          .map(([name, value]) => `${name.replace(/_/g, " ")}: ${str(value)}`)
          .join(" · "),
        tone: "neutral",
      }
    case "ai_audio_transcription":
      return { title: key("transcribed"), detail: str(output.text), tone: "neutral" }
    case "add_tag":
      return { title: key("tagged"), detail: str(output.tag), tone: "neutral" }
    case "remove_tag":
      return { title: key("untagged"), detail: str(output.removed), tone: "neutral" }
    case "set_custom_attribute":
      return { title: key("attribute"), detail: `${str(output.key)}: ${str(output.value)}`, tone: "neutral" }
    case "assign_agent":
      return { title: key("assignedAgent"), tone: "neutral" }
    case "assign_team":
      return { title: key("assignedTeam"), tone: "neutral" }
    case "transfer_to_human":
      return { title: key("transferred"), tone: "neutral" }
    case "finalize_chat":
      return { title: key("finalized"), tone: "success" }
    case "pause_automation":
      return { title: key("paused"), tone: "neutral" }
    case "resume_automation":
      return { title: key("resumed"), tone: "neutral" }
    case "set_funnel_stage":
      return { title: output.moved ? key("funnelMoved") : key("funnelSame"), tone: "neutral" }
    case "http_request": {
      const status = output.status
      return {
        title: key("httpDone", { status: str(status) }),
        detail: str(input.url),
        tone: Number(status) >= 400 ? "warning" : "success",
      }
    }
    case "execute_tool":
      return { title: key("toolDone"), detail: str(input.tool), tone: "success" }
    case "goto_flow":
      return { title: key("subflow"), tone: "neutral" }
    case "catalog_search":
      return { title: key("catalog", { count: Number(output.total ?? 0) }), detail: str(input.query), tone: "neutral" }
    case "end":
      return { title: key("ended"), tone: "neutral" }
    default:
      if (type.startsWith("pipeline_")) {
        return { title: key("pipelineDone"), detail: human(output.title), tone: "success" }
      }
      return { title: key("done"), tone: "neutral" }
  }
}

/** O nome da conversa quando há, ou o telefone do contato. */
export function contactLabel(execution: { contactName?: string | null; contactId: string | null }, t: TFunction): string {
  return execution.contactName || execution.contactId || t("flows.executions.unknownContact")
}
