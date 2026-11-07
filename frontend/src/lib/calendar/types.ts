// Formas da API da agenda (docs/migration/api/agenda.md). Datas em milissegundos, ids em
// texto. A exceção são `startDate` e `endDate` da turma, que são dias: "AAAA-MM-DD".

export type CalendarType = "professional" | "class_group"
export type ReminderPeriod = "minutes" | "hours" | "days"
export type RebalancingPeriod = "day" | "week" | "month"
export type ProfessionalEventName = "created" | "canceled" | "rescheduled"

/** Lembrete ao contato. `message` é grátis; `aiPrompt` gera o texto e custa 1 crédito. */
export type ContactReminderRule = {
  interval: number
  period: ReminderPeriod
  message?: string | null
  aiPrompt?: string | null
}

export type ProfessionalReminderRule = {
  timeBefore: number
  period: ReminderPeriod
  message?: string | null
  push?: boolean
  whatsapp?: boolean
}

export type ProfessionalEventRule = {
  event: ProfessionalEventName
  push: boolean
  whatsapp: boolean
  message?: string | null
}

export type GoogleConnector = {
  id: string
  type: string
  status: string
  googleEmail: string | null
  connectedAt: number | null
  errorMessage: string | null
}

export type SequenceTrigger = "show" | "no_show"
export type SequenceAnchor = "attendance_mark" | "after_event_end"

export type SequenceStep = {
  /** Vazio em passo novo: a API dá um id ao salvar. */
  id?: string
  name?: string | null
  message?: string | null
  aiPrompt?: string | null
  runAfter: number
  runAfterUnit: ReminderPeriod
  timeFrom?: number | null
  timeAt?: number | null
  allDay?: boolean
}

export type AttendanceSequence = {
  id?: string
  name: string
  trigger: SequenceTrigger
  enabled: boolean
  autoEnroll: boolean
  stopOnReply: boolean
  ignoreAutomationPaused: boolean
  reactivateAutomation: boolean
  autoEnrollAnchors: SequenceAnchor[]
  autoEnrollMinutesAfterEnd: number | null
  steps: SequenceStep[]
}

export type AgendaCalendar = {
  id: string
  name: string
  description: string | null
  timeZone: string
  calendarType: CalendarType
  color: string | null
  rebalancingPeriod: RebalancingPeriod
  professionalNotificationsSettings: ProfessionalReminderRule[]
  professionalEventNotifications: ProfessionalEventRule[]
  /** Só leitura: as três regras já resolvidas contra os padrões. É daqui que a tela lê. */
  professionalEventRules: ProfessionalEventRule[]
  professionalWhatsappConnectorId: string | null
  schedulingNotificationEnabled: boolean
  schedulingNotificationConfig: ContactReminderRule[]
  schedulingNotificationReactivateAutomation: boolean
  schedulingNotificationIgnoreAutomationPaused: boolean
  attendanceSequences: AttendanceSequence[]
  googleCalendarAvailable: boolean
  googleCalendarConnected: boolean
  googleCalendarConnector: GoogleConnector | null
  createdAt: number
  updatedAt: number
}

export type CalendarInput = Partial<
  Pick<
    AgendaCalendar,
    | "name"
    | "description"
    | "timeZone"
    | "calendarType"
    | "color"
    | "rebalancingPeriod"
    | "schedulingNotificationEnabled"
    | "schedulingNotificationReactivateAutomation"
    | "schedulingNotificationIgnoreAutomationPaused"
    | "schedulingNotificationConfig"
    | "professionalNotificationsSettings"
    | "professionalEventNotifications"
    | "professionalWhatsappConnectorId"
  >
>

/* ---------- profissionais e serviços ---------- */

export type TimeWindow = { start: string; end?: string | null }

export type ScheduleDay = {
  /** 0 é domingo. */
  dayOfWeek: number
  enabled: boolean
  windows: TimeWindow[]
}

export type BlockedTime = { start: string; end: string }

export type ProfessionalRule = {
  id?: string
  days: ScheduleDay[]
  blockedTimes: BlockedTime[]
}

/** Na tela é "Colaborador"; na API, `Professional`. */
export type Professional = {
  id: string
  calendarId: string
  accountId: string | null
  name: string
  email: string | null
  phone: string | null
  externalId: string | null
  color: string | null
  avatarUrl: string | null
  serviceIds: string[]
  rule: ProfessionalRule | null
  createdAt: number
  updatedAt: number
}

export type ProfessionalInput = Partial<
  Pick<Professional, "name" | "email" | "phone" | "color" | "externalId" | "accountId">
> & { rule?: { days: ScheduleDay[]; blockedTimes: BlockedTime[] } }

export type AgendaService = {
  id: string
  calendarId: string
  name: string
  description: string | null
  duration: number
  bufferBefore: number
  bufferAfter: number
  timeIncrementInterval: number
  guestLimit: number
  externalId: string | null
  successMessage: string | null
  /** Id do profissional para a porcentagem. Soma 100. */
  distribution: Record<string, number>
  createdAt: number
  updatedAt: number
}

export type AgendaServiceInput = Partial<
  Omit<AgendaService, "id" | "calendarId" | "createdAt" | "updatedAt">
>

export type AvailabilityResponse = {
  professionalId: string | null
  professionalName: string | null
  serviceName: string | null
  /** Por dia ("AAAA-MM-DD", no fuso do calendário), com a hora de parede de cada início. */
  slots: Record<string, string[]>
  priorityProfessionalName: string | null
  fallback: boolean
}

/* ---------- o calendário ---------- */

export type EventStatus = "active" | "canceled" | "archived"
export type AttendanceStatus = "show" | "no_show"

export type BookingHistoryEntry = {
  eventName: string
  userName: string | null
  byUser: boolean
  updatedAt: number
  start?: [number, number]
  end?: [number, number]
  title?: [string | null, string | null] | string
  sequenceId?: string
  sequenceName?: string
  trigger?: string
  stepsCount?: number
  auto?: boolean
}

export type BookingEvent = {
  id: string
  type: "booking"
  calendarId: string
  professionalId: string | null
  professionalName: string | null
  professionalAvatarUrl: string | null
  serviceId: string | null
  serviceName: string | null
  chatId: string | null
  contactExternalId: string | null
  userName: string | null
  profilePictureUrl: string | null
  customAttributes: Record<string, unknown>
  title: string
  description: string | null
  color: string | null
  start: number
  end: number
  status: EventStatus
  attendanceStatus: AttendanceStatus | null
  externalId: string | null
  googleMeetUrl: string | null
  enrolledSequenceId: string | null
  sequenceEnrolledAt: number | null
  eventHistory: BookingHistoryEntry[]
  createdAt: number
  updatedAt: number
}

export type AttendanceSummary = {
  total: number
  show: number
  noShow: number
  pending: number
}

export type ClassSessionEvent = {
  id: string
  type: "class_session"
  /** Aula calculada, ainda sem documento: o id é `vcs_<turma>_<AAAAMMDD>_<HHMM>`. */
  virtual: boolean
  start: number
  end: number
  status: EventStatus
  title: string
  notes: string | null
  classGroupId: string
  classGroupName: string
  calendarId: string
  color: string | null
  textColor: string | null
  instructorName: string | null
  room: string | null
  location: string | null
  enrollmentCount: number
  maxStudents: number | null
  attendanceSummary: AttendanceSummary | null
  scheduleDayOfWeek: number | null
  scheduleWindowStart: string | null
  createdAt?: number
  updatedAt?: number
}

export type CalendarEvent = BookingEvent | ClassSessionEvent

export type BookingInput = {
  calendarId?: string
  start?: number | string
  end?: number | string
  title?: string | null
  description?: string | null
  color?: string | null
  professionalId?: string | null
  serviceId?: string | null
  chatId?: string | null
  externalId?: string | null
  status?: EventStatus
  attendanceStatus?: AttendanceStatus | "" | null
}

export type CalendarEventFilters = {
  calendarIds?: string[]
  professionalIds?: string[]
  serviceIds?: string[]
  tagIds?: string[]
}

/** O painel de filtros, em uma ida só. */
export type CalendarFilterOptions = {
  calendars: { id: string; name: string; timeZone: string; calendarType: CalendarType }[]
  professionals: { id: string; name: string; calendarId: string; color: string | null }[]
  services: { id: string; name: string; calendarId: string }[]
  tags: { id: string; name: string; description: string | null; color: string | null; createdAt: number }[]
  teams: { id: string; name: string }[]
}

export type MonthCounts = Record<string, number>

/* ---------- turmas ---------- */

export type RecurrenceType = "weekly" | "biweekly" | "monthly"
export type RecurrenceEndType = "date" | "occurrences" | "never"

export type ClassGroup = {
  id: string
  calendarId: string
  name: string
  description: string | null
  externalId: string | null
  color: string | null
  textColor: string | null
  maxStudents: number | null
  minStudents: number | null
  defaultDurationMinutes: number | null
  /** Dia puro, "AAAA-MM-DD". */
  startDate: string | null
  endDate: string | null
  schedule: ScheduleDay[]
  location: string | null
  room: string | null
  address: string | null
  instructorName: string | null
  instructorAccountId: string | null
  active: boolean
  visible: boolean
  recurrenceType: RecurrenceType
  recurrenceEndType: RecurrenceEndType
  recurrenceOccurrences: number | null
  tags: string[]
  category: string | null
  priceCents: number | null
  priceCurrency: string | null
  notes: string | null
  activeEnrollmentCount: number
  createdAt: number
  updatedAt: number
}

export type ClassGroupInput = Partial<
  Omit<ClassGroup, "id" | "calendarId" | "activeEnrollmentCount" | "createdAt" | "updatedAt">
>

export type ClassEnrollment = {
  id: string
  classGroupId: string
  chatId: string | null
  status: string
  enrolledAt: number
  scheduleDayOfWeek: number | null
  scheduleWindowStart: string | null
  externalId: string | null
  notes: string | null
  userName: string | null
  profilePictureUrl: string | null
  contactExternalId: string | null
}

export type ClassAttendance = {
  /** `ve_<inscrição>` para quem está inscrito e ainda sem registro. */
  id: string
  classSessionId: string | null
  classEnrollmentId: string | null
  chatId: string | null
  attendanceStatus: AttendanceStatus | null
  checkedAt: number | null
  checkedBy: string | null
  guest: boolean
  userName: string | null
  profilePictureUrl: string | null
  contactExternalId: string | null
}

export type ClassSessionDetail = ClassSessionEvent & { attendances: ClassAttendance[] }

export type ClassSessionInput = {
  start?: number | string
  end?: number | string
  title?: string | null
  notes?: string | null
  color?: string | null
  status?: EventStatus
}

export type ScheduleWindowOption = {
  dayOfWeek: number
  windowStart: string
  windowEnd: string | null
  current: boolean
}

/* ---------- testar mensagens ---------- */

export type PreviewBooking = {
  id: string
  chatId: string
  userName: string | null
  title: string
  start: number
  end: number
  serviceName: string | null
  professionalName: string | null
  attendanceStatus: AttendanceStatus | null
}

export type PreviewMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
  /** Como no chat: áudio sem transcrição guarda só "-" em `content`, e o tipo diz o que é. */
  typeElement?: "text" | "image" | "audio" | "media" | string
  mediaType?: string | null
}

/* ---------- conversa (busca) ---------- */

export type ChatLookupItem = {
  id: string
  userName: string | null
  displayName: string | null
  externalId: string | null
  profilePictureUrl: string | null
}

/* ---------- tempo real ---------- */

export type AgendaChannelMessage =
  | { action: "create" | "update" | "destroy"; type: "booking" | "class_session"; event: CalendarEvent }
  | {
      action: "attendance_update"
      type: "class_session"
      classSessionId: string
      classGroupId: string
      scheduleDayOfWeek: number | null
      scheduleWindowStart: string | null
      attendanceSummary: AttendanceSummary
      enrollmentCount?: number
    }
  | {
      action: "enrollment_update"
      type: "class_session"
      classGroupId: string
      scheduleDayOfWeek: number | null
      scheduleWindowStart: string | null
      enrollmentCount: number
    }
