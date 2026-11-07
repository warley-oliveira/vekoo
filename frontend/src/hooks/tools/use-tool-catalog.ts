import { useMemo } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { CatalogTool, ToolInstallation } from "@/lib/tools/types"

export const TOOL_CATALOG_KEY = "/tool-catalog"
export const TOOL_INSTALLATIONS_KEY = "/tool-installations"

const NO_TOOLS: CatalogTool[] = []
const NO_INSTALLATIONS: ToolInstallation[] = []

type InstallationsResponse = { installations: ToolInstallation[] }

/** O catálogo é igual para toda organização e muda com a versão do produto: não precisa perguntar de novo. */
const CATALOG_DATA = { revalidateOnFocus: false, dedupingInterval: 300_000 }

export function useToolCatalog() {
  const { data, error, isLoading, mutate } = useApi<{ tools: CatalogTool[] }>(TOOL_CATALOG_KEY, CATALOG_DATA)
  return { tools: data?.tools ?? NO_TOOLS, hasData: Boolean(data), error, isLoading, reload: mutate }
}

/** O detalhe traz as funções. Só desce quando o painel abre. */
export function useCatalogTool(id: string | null) {
  const { data, error, isLoading, mutate } = useApi<{ tool: CatalogTool }>(
    id ? `${TOOL_CATALOG_KEY}/${id}` : null,
    CATALOG_DATA
  )
  return { tool: data?.tool ?? null, error, isLoading, reload: mutate }
}

export function useToolInstallations() {
  const { data, error, isLoading, mutate } = useApi<InstallationsResponse>(TOOL_INSTALLATIONS_KEY)
  return {
    installations: data?.installations ?? NO_INSTALLATIONS,
    hasData: Boolean(data),
    error,
    isLoading,
    reload: mutate,
  }
}

export function useToolInstallationMutations() {
  const { mutate } = useSWRConfig()

  return useMemo(() => {
    // Instalar e desinstalar mudam as funções: a lista daqui e os seletores dos blocos.
    const refreshFunctions = () => mutate((key) => typeof key === "string" && key.startsWith("/tools"))

    const store = (installation: ToolInstallation) =>
      mutate<InstallationsResponse>(
        TOOL_INSTALLATIONS_KEY,
        (current) => {
          const list = current?.installations ?? []
          const known = list.some((item) => item.id === installation.id)
          return {
            installations: known
              ? list.map((item) => (item.id === installation.id ? installation : item))
              : [...list, installation],
          }
        },
        { revalidate: false }
      )

    return {
      install: async (toolId: string, credentials?: Record<string, string>) => {
        const { installation } = await apiPost<{ installation: ToolInstallation }>(TOOL_INSTALLATIONS_KEY, {
          toolId,
          credentials,
        })
        await store(installation)
        void refreshFunctions()
        return installation
      },
      updateCredentials: async (id: string, credentials: Record<string, string>) => {
        const { installation } = await apiPatch<{ installation: ToolInstallation }>(`${TOOL_INSTALLATIONS_KEY}/${id}`, {
          credentials,
        })
        await store(installation)
        return installation
      },
      /** Muda na hora e volta atrás se a API recusar. */
      toggle: async (installation: ToolInstallation) => {
        await store({ ...installation, enabled: !installation.enabled })
        try {
          const updated = await apiPatch<{ installation: ToolInstallation }>(
            `${TOOL_INSTALLATIONS_KEY}/${installation.id}/toggle`
          )
          await store(updated.installation)
          void refreshFunctions()
          return updated.installation
        } catch (error) {
          await store(installation)
          throw error
        }
      },
      uninstall: async (id: string) => {
        await apiDelete(`${TOOL_INSTALLATIONS_KEY}/${id}`)
        await mutate<InstallationsResponse>(
          TOOL_INSTALLATIONS_KEY,
          (current) => ({ installations: (current?.installations ?? []).filter((item) => item.id !== id) }),
          { revalidate: false }
        )
        void refreshFunctions()
      },
    }
  }, [mutate])
}
