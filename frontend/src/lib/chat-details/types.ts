// Formatos do que o painel do contato lê: `docs/migration/api/agenda.md`,
// `pipelines.md` e `insights.md`. Ids como string, datas em milissegundos.

export type BookingStatus = "active" | "canceled" | "archived"

export type BookingHistoryEntry = {
  eventName: string
  userName?: string | null
  byUser?: boolean
  updatedAt: number
  sequenceName?: string | null
}

export type Booking = {
  id: string
  type: "booking"
  calendarId: string
  professionalName: string | null
  serviceName: string | null
  title: string
  color: string | null
  start: number
  end: number
  status: BookingStatus
  attendanceStatus: "show" | "no_show" | null
  googleMeetUrl: string | null
  enrolledSequenceId: string | null
  sequenceEnrolledAt: number | null
  eventHistory: BookingHistoryEntry[] | null
}

/** `chatId` no calendário devolve só agendamentos, mas a API mistura os tipos: o `type` decide. */
export type CalendarEvent = Booking | { id: string; type: "class_session" }

export type CalendarEventsResponse = { events: CalendarEvent[] }

export type CalendarFilters = {
  calendars: { id: string; name: string; timeZone: string | null }[]
}

export type ScheduledAction = {
  id: string
  chatId: string
  kind: string
  name: string
  status: string
  scheduledAt: number
  bookingId?: string | null
  metadata?: {
    bookingTitle?: string | null
    bookingStart?: number | null
    professionalName?: string | null
    fallbackReason?: string | null
  } | null
}

export type ScheduledWork = {
  actions: ScheduledAction[]
  automation: { enabled: boolean; reactivatesAt: number | null }
}

export type CardPriority = "low" | "medium" | "high" | "urgent"

export type ChatPipelineCard = {
  id: string
  title: string
  priority: CardPriority | null
  dueDate: number | null
  dealValue: number | null
  wonAt: number | null
  lostAt: number | null
  isRotting: boolean
  stage: { id: string; name: string }
  board: { id: string; name: string; color: string | null }
}

export type ChatPipelineCardsResponse = { cards: ChatPipelineCard[] }

export type PipelineBoardOption = {
  id: string
  name: string
  stages: { id: string; name: string }[]
}

export type FunnelStage = { id: string; name: string; position: number }

export type Funnel = {
  id: string
  name: string
  description: string | null
  stages: FunnelStage[]
}

export type FunnelsResponse = { funnels: Funnel[] }

export type BulkResult = { updatedCount: number }

export type ChatSettings = {
  autoRemoveWaitingOperatorTag?: boolean
  reopenConversationOnInboundEnabled?: boolean
}

export type SuggestReplyResponse = {
  messages: string[]
  credits: { total: number; used: number; left: number }
}
