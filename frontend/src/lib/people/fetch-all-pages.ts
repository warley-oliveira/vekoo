import { apiGet, type PaginationMeta } from "@/lib/api"

/**
 * Lê a coleção inteira, de página em página. A API entrega até 100 por vez, e estas telas
 * buscam, filtram e ordenam no navegador: parar na primeira página esconderia gente sem
 * avisar, numa organização grande.
 */
export async function fetchAllPages<T>(path: string, resource: string): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?"
  const items: T[] = []

  for (let page = 1; ; page += 1) {
    const response = await apiGet<{ meta: PaginationMeta } & Record<string, unknown>>(
      `${path}${separator}page=${page}`
    )
    items.push(...(response[resource] as T[]))
    if (!response.meta.hasMore) return items
  }
}
