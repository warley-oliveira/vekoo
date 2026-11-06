// O que `GET /dashboard` e `GET /dashboard/calendar-stats` respondem. O contrato está em
// docs/migration/api/insights.md e agenda.md. Dia sem hora é texto (`2026-10-08`), porque é o dia da
// organização, e não um instante.

export type CountPoint = { date: string; count: number }

export type VolumePoint = {
  date: string
  inbound: number
  automation: number
  campaign: number
  human: number
}

export type AccountRanking = {
  id: string
  /** Nulo: a pessoa saiu da organização. */
  name: string | null
  avatarUrl: string | null
  messages: number
}

export type HeatDay = {
  date: string
  /** Só as horas com mensagem: a que não vem é zero. */
  events: { hour: number; count: number }[]
}

export type FunnelStageStat = {
  id: string
  name: string
  /** Estão na etapa. */
  count: number
  /** Chegaram até ela: acumulado. */
  reached: number
  /** Da primeira até esta, em pontos percentuais. */
  conversionRate: number
  /** Da anterior para esta, em pontos percentuais. */
  stepRate: number
  dropOff: number
}

export type FunnelTagStat = {
  id: string
  name: string
  color: string | null
  count: number
}

export type FunnelStat = {
  id: string
  name: string
  description: string | null
  total: number
  stages: FunnelStageStat[]
  tags: FunnelTagStat[]
}

export type DashboardReport = {
  hasData: boolean
  period: { dateStart: string; dateEnd: string }
  chatsTotal: number
  newChats: CountPoint[]
  activeChats: CountPoint[]
  automationChats: CountPoint[]
  messagesInbound: number
  messagesSentByAutomation: number
  messagesSentByCampaign: number
  messagesSentByHuman: number
  messageVolume: VolumePoint[]
  messagesByAccount: AccountRanking[]
  chatsByChannel: Record<string, number>
  /** `null` sem amostra: mostre um traço, nunca zero. */
  firstResponseAutomationSeconds: number | null
  firstResponseHumanSeconds: number | null
  firstResponseAutomationCount: number
  firstResponseHumanCount: number
  chatsWithHumanTouch: number
  humanTouchRate: number
  chatsHandledByAutomation: number
  automationResolutionRate: number
  hoursSaved: number
  messagesAvoided: number
  outOfHoursMessages: number
  automationBookings: number
  heatMap: HeatDay[]
  funnels: FunnelStat[]
}

export type UpcomingBooking = {
  id: string
  title: string | null
  start: number
  end: number
  status: string
  attendanceStatus: string | null
  color: string | null
}

export type ProfessionalStat = {
  id: string
  name: string
  color: string | null
  show: number
  noShow: number
  total: number
}

export type CalendarStats = {
  total: number
  show: number
  noShow: number
  /** O que não tem comparecimento marcado, inclusive cancelado. */
  pending: number
  canceled: number
  active: number
  attendanceRate: number | null
  cancellationRate: number | null
  /** Só os dias com presença marcada. */
  daily: { date: string; show: number; noShow: number }[]
  upcoming: UpcomingBooking[]
  byProfessional: ProfessionalStat[]
  /** Sete posições, a partir do domingo. */
  byDayOfWeek: number[]
  /** Vinte e quatro posições. */
  byHour: number[]
  avgPerDay: number
}
