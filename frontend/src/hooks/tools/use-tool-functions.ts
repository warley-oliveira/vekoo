import { useMemo } from "react"
import useSWR, { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import type { ToolFunction, ToolFunctionInput } from "@/lib/tools/types"

export const TOOL_FUNCTIONS_KEY = "/tools?perPage=100"

const NO_FUNCTIONS: ToolFunction[] = []

/** As funções da organização, inteiras: são dezenas, e a tela busca e agrupa sem ir ao servidor. */
export function useToolFunctions() {
  const { data, error, isLoading, mutate } = useSWR<ToolFunction[]>(TOOL_FUNCTIONS_KEY, () =>
    fetchAllPages<ToolFunction>(TOOL_FUNCTIONS_KEY, "tools")
  )
  return { functions: data ?? NO_FUNCTIONS, hasData: Boolean(data), error, isLoading, reload: mutate }
}

export function toolFunctionKey(id: string) {
  return `/tools/${id}`
}

export function useToolFunction(id: string | null) {
  const { data, error, isLoading, mutate } = useApi<{ tool: ToolFunction }>(id ? toolFunctionKey(id) : null, {
    revalidateOnFocus: false,
  })
  return { fn: data?.tool ?? null, error, isLoading, reload: mutate }
}

export function useToolFunctionMutations() {
  const { mutate } = useSWRConfig()

  return useMemo(() => {
    const refresh = () => mutate((key) => typeof key === "string" && key.startsWith("/tools"))

    // A função já fica no cache antes de a lista ser relida: é o que deixa o editor trocar de endereço sem piscar.
    const store = async (tool: ToolFunction) => {
      await mutate(toolFunctionKey(tool.id), { tool }, { revalidate: false })
      void mutate((key) => typeof key === "string" && key.startsWith("/tools?"))
      return tool
    }

    return {
      createFunction: async (input: ToolFunctionInput) => {
        const { tool } = await apiPost<{ tool: ToolFunction }>("/tools", { tool: input })
        return store(tool)
      },
      updateFunction: async (id: string, input: ToolFunctionInput) => {
        const { tool } = await apiPatch<{ tool: ToolFunction }>(toolFunctionKey(id), { tool: input })
        return store(tool)
      },
      personalizeFunction: async (id: string) => {
        const { tool } = await apiPost<{ tool: ToolFunction }>(`${toolFunctionKey(id)}/personalize`)
        return store(tool)
      },
      deleteFunction: async (id: string) => {
        await apiDelete(toolFunctionKey(id))
        void refresh()
      },
    }
  }, [mutate])
}
