import { useApi } from "@/hooks/use-api"
import type { EngineCatalog } from "@/lib/engines"

export const ENGINES_KEY = "/engines"

/** O catálogo de motores — igual para todo mundo, muda só com deploy. */
export function useEngines() {
  const { data, error, isLoading, mutate } = useApi<EngineCatalog>(ENGINES_KEY, {
    revalidateOnFocus: false,
  })

  return {
    engines: data?.engines,
    dimensions: data?.dimensions,
    isLoading: isLoading && !data,
    error,
    reload: () => mutate(),
  }
}

export function useEngine(engineId: string | undefined) {
  const catalog = useEngines()
  return {
    ...catalog,
    engine: catalog.engines?.find((engine) => engine.id === engineId),
  }
}
