import { useMemo } from "react"
import { useSWRConfig } from "swr"

import { REFERENCE_DATA } from "@/hooks/chat/use-chat-refs"
import { useApi } from "@/hooks/use-api"
import { apiGet, apiPatch, apiPost } from "@/lib/api"
import type { WhatsappTemplate } from "@/lib/connectors/types"
import type {
  PipelineBoardOption,
  PipelineCustomField,
  PipelineLabel,
  ToolDetail,
  ToolParameter,
  ToolSummary,
  ToolTestRun,
} from "@/lib/flows/types"

// O que os blocos escolhem pelas APIs reais: quadros e etapas, funções, modelos. Muda pouco, e a mesma
// chave do SWR atende todos os blocos de uma vez; só chama quando o inspetor do bloco abre.

const NO_BOARDS: PipelineBoardOption[] = []
const NO_FIELDS: PipelineCustomField[] = []
const NO_LABELS: PipelineLabel[] = []
const NO_TOOLS: ToolSummary[] = []
const NO_TEMPLATES: WhatsappTemplate[] = []

export function usePipelineOptions() {
  const { data, isLoading, error } = useApi<{ boards: PipelineBoardOption[] }>(
    "/pipelines/boards?withStages=true",
    REFERENCE_DATA
  )
  return { boards: data?.boards ?? NO_BOARDS, isLoading, error }
}

export function usePipelineFields(boardId: string | null) {
  const { data, isLoading } = useApi<{ customFields: PipelineCustomField[] }>(
    boardId ? `/pipelines/boards/${boardId}/custom-fields` : null,
    REFERENCE_DATA
  )
  return { fields: data?.customFields ?? NO_FIELDS, isLoading }
}

export function usePipelineLabels() {
  const { data, isLoading } = useApi<{ labels: PipelineLabel[] }>("/pipelines/labels", REFERENCE_DATA)
  return { labels: data?.labels ?? NO_LABELS, isLoading }
}

export function useToolOptions() {
  const { data, isLoading, mutate } = useApi<{ tools: ToolSummary[] }>("/tools?summary=true&perPage=100", REFERENCE_DATA)
  return { tools: data?.tools ?? NO_TOOLS, isLoading, reload: mutate }
}

export function useToolDetail(id: string | null) {
  const { data, isLoading, error, mutate } = useApi<{ tool: ToolDetail }>(id ? `/tools/${id}` : null, {
    revalidateOnFocus: false,
  })
  return { tool: data?.tool ?? null, isLoading, error, reload: mutate }
}

export type ToolInput = {
  name: string
  description: string
  jsCode: string
  parameters: ToolParameter[]
}

export function useToolMutations() {
  const { mutate } = useSWRConfig()
  return useMemo(() => {
    const refresh = () => mutate((key) => typeof key === "string" && key.startsWith("/tools"))
    return {
      createTool: async (tool: ToolInput) => {
        const created = await apiPost<{ tool: ToolDetail }>("/tools", { tool })
        void refresh()
        return created.tool
      },
      updateTool: async (id: string, tool: Partial<ToolInput>) => {
        const updated = await apiPatch<{ tool: ToolDetail }>(`/tools/${id}`, { tool })
        void refresh()
        return updated.tool
      },
      personalizeTool: async (id: string) => {
        const updated = await apiPost<{ tool: ToolDetail }>(`/tools/${id}/personalize`)
        void refresh()
        return updated.tool
      },
    }
  }, [mutate])
}

/** Roda a função na fila de scripts e espera o resultado, consultando de tempos em tempos. */
export async function runToolTest(
  toolId: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ToolTestRun> {
  const { testRun } = await apiPost<{ testRun: ToolTestRun }>(`/tools/${toolId}/test`, { args })
  const deadline = Date.now() + 90_000
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 700))
    if (signal?.aborted) throw new DOMException("cancelado", "AbortError")
    const { testRun: latest } = await apiGet<{ testRun: ToolTestRun }>(`/tools/${toolId}/test-runs/${testRun.id}`, { signal })
    if (latest.status !== "pending") return latest
    if (Date.now() > deadline) return { id: testRun.id, status: "pending" }
  }
}

/** Os modelos aprovados de um canal da WABA. A API sincroniza com a Meta a cada `GET`: uma vez por sessão. */
export function useWhatsappTemplates(connectorId: string | null) {
  const { data, isLoading } = useApi<{ templates: WhatsappTemplate[] }>(
    connectorId ? `/connectors/${connectorId}/templates` : null,
    REFERENCE_DATA
  )
  return { templates: data?.templates ?? NO_TEMPLATES, isLoading }
}

export type ChatLookup = {
  id: string
  userName: string | null
  displayName: string | null
  externalId: string
}

export async function lookupChats(query: string, signal?: AbortSignal): Promise<ChatLookup[]> {
  const { chats } = await apiGet<{ chats: ChatLookup[] }>(`/chats/lookup?q=${encodeURIComponent(query)}`, { signal })
  return chats
}
