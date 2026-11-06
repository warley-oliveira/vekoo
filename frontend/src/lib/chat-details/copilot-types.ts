// O contrato de `CopilotChannel`, em `docs/migration/api/inbox.md`.

export type CopilotActivity = {
  toolName: string
  status: "started" | "completed"
  activityType: "reading" | "writing"
  icon: string
  description: string
  timestamp: number
  success?: boolean
  contact?: { userName?: string | null; phoneNumber?: string | null } | null
  input?: unknown
  output?: unknown
}

export type CopilotSegment =
  | { type: "text"; content: string }
  | { type: "activity"; activity: CopilotActivity }

export type CopilotChange = {
  action: string
  chatId?: string
  appointmentId?: string
  tag?: string
  [key: string]: unknown
}

export type CopilotMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  changesApplied?: CopilotChange[] | null
  toolActivities?: CopilotActivity[] | null
  contentSegments?: CopilotSegment[] | null
}

export type CopilotErrorCode =
  | "noCredits"
  | "unavailable"
  | "failed"
  | "blankMessage"
  | "messageTooLong"
  /** Daqui: o canal não entregou o pedido, ou parou de responder, ou não veio nada útil. */
  | "offline"
  | "timeout"
  | "empty"

export type CopilotError = {
  code: CopilotErrorCode
  /** A frase do servidor, no idioma da pessoa. As nossas vêm da tradução. */
  message?: string | null
  /** O pedido chegou a andar: repetir pode refazer o que já foi feito. */
  mayHaveActed: boolean
}

export type CopilotBroadcast =
  | {
      action: "connected"
      data: { message: string; sessionId: string; savedMessages: CopilotMessage[] }
    }
  | { action: "text_chunk"; data: { chunk: string; seq: number } }
  | { action: "tool_activity"; data: CopilotActivity }
  | {
      action: "message_complete"
      data: { text: string; toolCalls: CopilotChange[]; changesApplied: CopilotChange[] }
    }
  | { action: "credits_updated"; data: { messageCredits: number; consumedCredits: number } }
  | { action: "error"; data: { error: string; code: CopilotErrorCode } }
  | { action: "history_cleared"; data: { success: boolean } }

export type CopilotArchive = {
  id: string
  preview: string
  archivedAt: number
  messages: CopilotMessage[]
}
