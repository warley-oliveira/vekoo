import { useCallback, useMemo } from "react"
import useSWR from "swr"

import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { AgendaService, AgendaServiceInput, Professional, ProfessionalInput } from "@/lib/calendar/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import { useRevalidateCalendars } from "./use-calendars"

export function professionalsKey(calendarId: string): string {
  return `/calendars/${calendarId}/professionals?perPage=100`
}

export function servicesKey(calendarId: string): string {
  return `/calendars/${calendarId}/services?perPage=100`
}

/** Na tela são "Colaboradores"; na API, `professionals`. */
export function useProfessionals(calendarId: string | null | undefined) {
  const key = calendarId ? professionalsKey(calendarId) : null
  const { data, error, isLoading, mutate } = useSWR<Professional[]>(key, () =>
    fetchAllPages<Professional>(key as string, "professionals")
  )
  return { professionals: data, error, isLoading, reload: () => mutate() }
}

export function useServices(calendarId: string | null | undefined) {
  const key = calendarId ? servicesKey(calendarId) : null
  const { data, error, isLoading, mutate } = useSWR<AgendaService[]>(key, () =>
    fetchAllPages<AgendaService>(key as string, "services")
  )
  return { services: data, error, isLoading, reload: () => mutate() }
}

export function useProfessionalMutations(calendarId: string) {
  // Profissional muda filtros, distribuição dos serviços e nomes na grade: tudo revalida junto.
  const revalidate = useRevalidateCalendars()

  const createProfessional = useCallback(
    async (input: ProfessionalInput) => {
      const saved = await apiPost<Professional>(`/calendars/${calendarId}/professionals`, {
        professional: input,
      })
      await revalidate()
      return saved
    },
    [calendarId, revalidate]
  )

  const updateProfessional = useCallback(
    async (id: string, input: ProfessionalInput) => {
      const saved = await apiPatch<Professional>(`/calendars/${calendarId}/professionals/${id}`, {
        professional: input,
      })
      await revalidate()
      return saved
    },
    [calendarId, revalidate]
  )

  /** Os agendamentos ficam, sem profissional, e a distribuição dos serviços deixa de somar 100. */
  const deleteProfessional = useCallback(
    async (id: string) => {
      await apiDelete(`/calendars/${calendarId}/professionals/${id}`)
      await revalidate()
    },
    [calendarId, revalidate]
  )

  return useMemo(
    () => ({ createProfessional, updateProfessional, deleteProfessional }),
    [createProfessional, deleteProfessional, updateProfessional]
  )
}

export function useServiceMutations(calendarId: string) {
  const revalidate = useRevalidateCalendars()

  const createService = useCallback(
    async (input: AgendaServiceInput) => {
      const saved = await apiPost<AgendaService>(`/calendars/${calendarId}/services`, {
        service: input,
      })
      await revalidate()
      return saved
    },
    [calendarId, revalidate]
  )

  const updateService = useCallback(
    async (id: string, input: AgendaServiceInput) => {
      const saved = await apiPatch<AgendaService>(`/calendars/${calendarId}/services/${id}`, {
        service: input,
      })
      await revalidate()
      return saved
    },
    [calendarId, revalidate]
  )

  /** Os agendamentos ficam, sem serviço. */
  const deleteService = useCallback(
    async (id: string) => {
      await apiDelete(`/calendars/${calendarId}/services/${id}`)
      await revalidate()
    },
    [calendarId, revalidate]
  )

  return useMemo(
    () => ({ createService, updateService, deleteService }),
    [createService, deleteService, updateService]
  )
}
