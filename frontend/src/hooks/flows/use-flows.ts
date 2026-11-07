import { useCallback, useMemo } from "react"
import { mutate as globalMutate } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api"
import type {
  ExecutionsResponse,
  FlowDefinition,
  FlowDetail,
  FlowExecutionDetail,
  FlowExecutionStatus,
  FlowSummary,
  FlowsResponse,
  FlowTemplate,
  FlowTriggerType,
  FlowVersion,
  FlowVersionSummary,
} from "@/lib/flows/types"

export const FLOWS_KEY = "/flows?perPage=100"
const NO_FLOWS: FlowSummary[] = []
const NO_TEMPLATES: FlowTemplate[] = []
const NO_VERSIONS: FlowVersionSummary[] = []

export const flowKey = (id: string) => `/flows/${id}`

/** Toda chave que mostra fluxos: a lista, os seletores e o próprio fluxo aberto. */
function reloadFlows() {
  return globalMutate((key) => typeof key === "string" && key.startsWith("/flows"), undefined, {
    revalidate: true,
  })
}

/** Uma organização tem poucas dezenas de fluxos: a lista vem inteira e a tela filtra sem ir ao servidor. */
export function useFlows() {
  const { data, error, isLoading, mutate } = useApi<FlowsResponse>(FLOWS_KEY, { keepPreviousData: true })
  return {
    flows: data?.flows ?? NO_FLOWS,
    hasData: Boolean(data),
    total: data?.meta.total ?? 0,
    error,
    isLoading,
    reload: mutate,
  }
}

export function useFlow(id: string | undefined) {
  // Revalidar ao voltar para a aba e de minuto em minuto é o que descobre edição em outro lugar:
  // a API não tem trava de versão, e a tela compara a data do rascunho (ver `useAutosave`).
  const { data, error, isLoading, mutate } = useApi<{ flow: FlowDetail }>(id ? flowKey(id) : null, {
    revalidateOnFocus: true,
    refreshInterval: 60_000,
    keepPreviousData: false,
  })
  return { flow: data?.flow ?? null, error, isLoading, reload: mutate }
}

export function useFlowTemplates(enabled = true) {
  const { data, error, isLoading, mutate } = useApi<{ flowTemplates: FlowTemplate[] }>(
    enabled ? "/flow-templates" : null,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )
  return { templates: data?.flowTemplates ?? NO_TEMPLATES, error, isLoading, reload: mutate }
}

export function useFlowVersions(id: string, enabled: boolean) {
  const { data, error, isLoading, mutate } = useApi<{ versions: FlowVersionSummary[] }>(
    enabled ? `/flows/${id}/versions?perPage=50` : null,
    { revalidateOnFocus: false }
  )
  return { versions: data?.versions ?? NO_VERSIONS, error, isLoading, reload: mutate }
}

export type CreateFlowInput = {
  name: string
  description?: string | null
  triggerType?: FlowTriggerType
  template?: string
}

export function useFlowMutations() {
  const createFlow = useCallback(async ({ template, ...flow }: CreateFlowInput) => {
    const created = await apiPost<{ flow: FlowDetail }>("/flows", { flow, template })
    void reloadFlows()
    return created.flow
  }, [])

  /** A API não tem cópia: lê o rascunho, cria o novo e grava a definição. Se a gravação falhar, desfaz. */
  const duplicateFlow = useCallback(async (source: FlowSummary, name: string) => {
    const { flow } = await apiGet<{ flow: FlowDetail }>(flowKey(source.id))
    const definition = flow.draft?.definition ?? flow.publishedVersion?.definition
    const created = await apiPost<{ flow: FlowDetail }>("/flows", {
      flow: {
        name,
        description: source.description,
        triggerType: source.triggerType,
        connectorFilter: source.connectorFilter,
      },
    })
    if (definition) {
      try {
        await apiPut(`/flows/${created.flow.id}/definition`, { definition })
      } catch (error) {
        await apiDelete(flowKey(created.flow.id)).catch(() => undefined)
        throw error
      }
    }
    void reloadFlows()
    return created.flow
  }, [])

  const updateFlow = useCallback(
    async (id: string, flow: Partial<Pick<FlowSummary, "name" | "description" | "triggerType" | "connectorFilter">>) => {
      const updated = await apiPatch<{ flow: FlowSummary }>(flowKey(id), { flow })
      void reloadFlows()
      return updated.flow
    },
    []
  )

  const saveDefinition = useCallback(
    (id: string, definition: FlowDefinition) =>
      apiPut<{ version: FlowVersion }>(`/flows/${id}/definition`, { definition }),
    []
  )

  const publishFlow = useCallback(async (id: string) => {
    const { flow } = await apiPost<{ flow: FlowDetail }>(`/flows/${id}/publish`)
    void reloadFlows()
    // Publicar resolve os alertas do fluxo (`flow_execution_failed` e os outros).
    void globalMutate("/alerts")
    return flow
  }, [])

  const archiveFlow = useCallback(async (id: string) => {
    const { flow } = await apiPost<{ flow: FlowSummary }>(`/flows/${id}/archive`)
    void reloadFlows()
    return flow
  }, [])

  const unarchiveFlow = useCallback(async (id: string) => {
    const { flow } = await apiPost<{ flow: FlowSummary }>(`/flows/${id}/unarchive`)
    void reloadFlows()
    return flow
  }, [])

  const deleteFlow = useCallback(async (id: string) => {
    await apiDelete(flowKey(id))
    void reloadFlows()
  }, [])

  return useMemo(
    () => ({ createFlow, duplicateFlow, updateFlow, saveDefinition, publishFlow, archiveFlow, unarchiveFlow, deleteFlow }),
    [archiveFlow, createFlow, deleteFlow, duplicateFlow, publishFlow, saveDefinition, unarchiveFlow, updateFlow]
  )
}

/* ---------- Execuções ---------- */

export type ExecutionFilters = {
  status?: FlowExecutionStatus | null
  page?: number
  perPage?: number
}

export function useFlowExecutions(flowId: string | null, filters: ExecutionFilters = {}) {
  const params = new URLSearchParams({ perPage: String(filters.perPage ?? 25), page: String(filters.page ?? 1) })
  if (filters.status) params.set("status", filters.status)

  const { data, error, isLoading, isValidating, mutate } = useApi<ExecutionsResponse>(
    flowId ? `/flows/${flowId}/executions?${params}` : null,
    { keepPreviousData: true, refreshInterval: 20_000 }
  )

  return {
    executions: data?.executions,
    counts: data?.counts,
    meta: data?.meta,
    error,
    isLoading,
    isValidating,
    reload: mutate,
  }
}

export function useFlowExecution(flowId: string | null, executionId: string | null) {
  const { data, error, isLoading, mutate } = useApi<{ execution: FlowExecutionDetail }>(
    flowId && executionId ? `/flows/${flowId}/executions/${executionId}` : null,
    {
      // Enquanto espera ou roda, o passo a passo ainda cresce.
      refreshInterval: (latest) =>
        latest && !["completed", "failed", "cancelled"].includes(latest.execution.status) ? 8_000 : 0,
    }
  )
  return { execution: data?.execution ?? null, error, isLoading, reload: mutate }
}

/** O gatilho manual: começa o fluxo numa conversa. */
export async function startFlowInChat(flowId: string, chatId: string) {
  await apiPost(`/flows/${flowId}/executions`, { chatId })
  void globalMutate((key) => typeof key === "string" && key.startsWith(`/flows/${flowId}/executions`))
}
