import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useAlerts } from "@/hooks/use-alerts"
import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type {
  ExecutionStatus,
  Trigger,
  TriggerExecutionsResponse,
  TriggerInput,
} from "@/lib/pipelines-admin/types"
import { boardKey, useRevalidateBoard } from "./use-board"

type TriggersResponse = { triggers: Trigger[] }

const TRIGGER_ALERTS_KEY = "/alerts/details?category=pipelines"

export function triggersKey(boardId: string) {
  return `${boardKey(boardId)}/triggers`
}

export function useTriggers(boardId: string) {
  const { data, error, isLoading, isValidating, mutate } = useApi<TriggersResponse>(
    triggersKey(boardId)
  )

  return {
    triggers: data?.triggers,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export function useTriggerMutations(boardId: string) {
  const { mutate } = useSWRConfig()
  const revalidate = useRevalidateBoard(boardId)
  const { reload: reloadAlerts } = useAlerts()
  const base = triggersKey(boardId)

  const createTrigger = useCallback(
    async (input: TriggerInput) => {
      const trigger = await apiPost<Trigger>(base, { trigger: input })
      await revalidate()
      return trigger
    },
    [base, revalidate]
  )

  const updateTrigger = useCallback(
    async (id: string, input: Partial<TriggerInput>) => {
      const trigger = await apiPatch<Trigger>(`${base}/${id}`, { trigger: input })
      await revalidate()
      return trigger
    },
    [base, revalidate]
  )

  const deleteTrigger = useCallback(
    async (id: string) => {
      await apiDelete(`${base}/${id}`)
      await revalidate()
      // Apagar resolve o alerta do gatilho: mudam o número do menu e o recado da lista.
      void reloadAlerts()
      void mutate(TRIGGER_ALERTS_KEY)
    },
    [base, mutate, reloadAlerts, revalidate]
  )

  /** Otimista: o interruptor responde na hora e volta sozinho se o servidor recusar. */
  const toggleTrigger = useCallback(
    async (trigger: Trigger) => {
      const flip = (current?: TriggersResponse) => ({
        triggers: (current?.triggers ?? []).map((item) =>
          item.id === trigger.id ? { ...item, active: !trigger.active } : item
        ),
      })
      await mutate<TriggersResponse>(
        base,
        async (current) => {
          await apiPost(`${base}/${trigger.id}/toggle`)
          return flip(current)
        },
        { optimisticData: flip, rollbackOnError: true, revalidate: false }
      )
      void revalidate()
    },
    [base, mutate, revalidate]
  )

  return { createTrigger, updateTrigger, deleteTrigger, toggleTrigger }
}

export type ExecutionFilters = {
  status?: ExecutionStatus | null
  triggerId?: string | null
  page?: number
  perPage?: number
}

export function useTriggerExecutions(
  boardId: string,
  { status, triggerId, page = 1, perPage = 30 }: ExecutionFilters = {}
) {
  const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
  if (status) params.set("status", status)
  if (triggerId) params.set("triggerId", triggerId)

  const { data, error, isLoading, isValidating, mutate } = useApi<TriggerExecutionsResponse>(
    `${boardKey(boardId)}/trigger-executions?${params}`,
    { keepPreviousData: true }
  )

  return {
    executions: data?.executions,
    meta: data?.meta,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export type TriggerAlert = {
  id: string
  originId: string
  originName: string | null
  metadata: { boardId?: string; board_id?: string } | null
}

/** O que está em alerta no menu. Um por gatilho, até uma execução dar certo. */
export function useTriggerAlerts(boardId: string) {
  const { data } = useApi<{ alerts: TriggerAlert[] }>(TRIGGER_ALERTS_KEY)

  return (data?.alerts ?? []).filter((alert) => {
    const owner = alert.metadata?.boardId ?? alert.metadata?.board_id
    return !owner || owner === boardId
  })
}
