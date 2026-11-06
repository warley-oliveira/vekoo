import { useCallback, useMemo } from "react"
import type { SWRConfiguration } from "swr"
import { mutate as globalMutate } from "swr"

import { useApi } from "@/hooks/use-api"
import { useCan } from "@/hooks/use-can"
import { REFERENCE_DATA } from "@/hooks/chat/use-chat-refs"
import { useAuth } from "@/lib/auth"
import { onlyBookings, sortBookings } from "@/lib/chat-details/bookings"
import type {
  Booking,
  CalendarEventsResponse,
  CalendarFilters,
  ChatPipelineCard,
  ChatPipelineCardsResponse,
  Funnel,
  FunnelsResponse,
  PipelineBoardOption,
  ScheduledAction,
  ScheduledWork,
} from "@/lib/chat-details/types"

// O que o painel busca por conversa. O padrão do app mantém a resposta anterior enquanto a nova não
// chega, para a lista não piscar. Aqui é o contrário: trocar de conversa mostrando o agendamento de
// outra pessoa é o pior que pode acontecer. O que já foi buscado volta na hora, do cache.
const PER_CHAT: SWRConfiguration = {
  keepPreviousData: false,
  revalidateOnFocus: false,
  // A conversa aberta recebe as mudanças pelo canal; sair e voltar logo depois não pergunta de novo.
  dedupingInterval: 30_000,
}

const NO_BOOKINGS: Booking[] = []
const NO_ACTIONS: ScheduledAction[] = []
const NO_CARDS: ChatPipelineCard[] = []
const NO_FUNNELS: Funnel[] = []
const NO_BOARDS: PipelineBoardOption[] = []

export const chatBookingsKey = (chatId: string) => `/calendar-events?chatId=${chatId}`
export const scheduledActionsKey = (chatId: string) => `/chats/${chatId}/scheduled-actions`
export const chatCardsKey = (chatId: string) => `/pipelines/cards?chatId=${chatId}`

/** Só com `calendar`: quem só tem `chat` recebe 403. */
export function useChatBookings(chatId: string) {
  const allowed = useCan("calendar")
  const { data, error, isLoading, mutate } = useApi<CalendarEventsResponse>(
    allowed ? chatBookingsKey(chatId) : null,
    PER_CHAT
  )

  const grouped = useMemo(() => {
    const bookings = data ? onlyBookings(data.events) : NO_BOOKINGS
    return sortBookings(bookings)
  }, [data])

  const retry = useCallback(() => void mutate(), [mutate])

  return { allowed, ...grouped, error, isLoading, retry }
}

/**
 * O fuso de um calendário: um horário se mostra no fuso do calendário dele, e não no do navegador. Sem
 * saber qual é (ainda carregando, ou sem `calendar`), vale o da organização.
 */
export function useCalendarTimeZone() {
  const allowed = useCan("calendar")
  const organizationZone = useAuth().session?.organization.timezone ?? null
  const { data } = useApi<CalendarFilters>(
    allowed ? "/calendar-events/filters" : null,
    REFERENCE_DATA
  )

  return useMemo(() => {
    const zones = new Map((data?.calendars ?? []).map((calendar) => [calendar.id, calendar.timeZone]))
    return (calendarId: string | null | undefined) =>
      (calendarId ? zones.get(calendarId) : null) ?? organizationZone
  }, [data, organizationZone])
}

export function useScheduledActions(chatId: string) {
  const { data, error, isLoading, mutate } = useApi<ScheduledWork>(
    scheduledActionsKey(chatId),
    PER_CHAT
  )
  const retry = useCallback(() => void mutate(), [mutate])

  return { actions: data?.actions ?? NO_ACTIONS, error, isLoading, retry }
}

/** Tira da lista antes da resposta. O canal confirma com o retrato inteiro logo depois. */
export function removeScheduledActionFromCache(chatId: string, actionId: string): void {
  void globalMutate<ScheduledWork>(
    scheduledActionsKey(chatId),
    (current) =>
      current && {
        ...current,
        actions: current.actions.filter((action) => action.id !== actionId),
      },
    { revalidate: false }
  )
}

export function useChatPipelineCards(chatId: string) {
  const allowed = useCan("pipelines")
  const { data, error, isLoading, mutate } = useApi<ChatPipelineCardsResponse>(
    allowed ? chatCardsKey(chatId) : null,
    // Os cards mudam no quadro, sem aviso aqui: vale conferir ao voltar para a janela.
    { ...PER_CHAT, revalidateOnFocus: true }
  )
  const retry = useCallback(() => void mutate(), [mutate])

  return { allowed, cards: data?.cards ?? NO_CARDS, error, isLoading, retry }
}

export function usePipelineBoardOptions(enabled: boolean) {
  const { data, error, isLoading, mutate } = useApi<{ boards: PipelineBoardOption[] }>(
    enabled ? "/pipelines/boards?withStages=true" : null,
    { keepPreviousData: false, revalidateOnFocus: false }
  )
  const retry = useCallback(() => void mutate(), [mutate])

  return { boards: data?.boards ?? NO_BOARDS, error, isLoading, retry }
}

/** Só com `funnel`. Muda pouco, e a posição da conversa mora nela mesma (`funnelStages`). */
export function useFunnels() {
  const allowed = useCan("funnel")
  const { data, error, isLoading, mutate } = useApi<FunnelsResponse>(
    allowed ? "/funnels" : null,
    REFERENCE_DATA
  )
  const retry = useCallback(() => void mutate(), [mutate])

  return { allowed, funnels: data?.funnels ?? NO_FUNNELS, error, isLoading, retry }
}
