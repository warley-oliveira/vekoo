import { useCallback, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"

import { useLocalStorage } from "@/hooks/use-local-storage"

// O estado da grade mora na URL: abrir um item e voltar devolve a pessoa exatamente aonde
// ela estava, e dá para mandar o link de uma busca. Só a preferência de tamanho de página
// fica no navegador, porque não muda o que se está procurando.

export type CatalogSort = "recent" | "newest" | "oldest" | "titleAsc" | "titleDesc" | "sku"
export type CatalogStatus = "active" | "inactive"

const SORTS: Record<CatalogSort, { sortBy: string; sortOrder: "asc" | "desc" }> = {
  recent: { sortBy: "updatedAt", sortOrder: "desc" },
  newest: { sortBy: "createdAt", sortOrder: "desc" },
  oldest: { sortBy: "createdAt", sortOrder: "asc" },
  titleAsc: { sortBy: "title", sortOrder: "asc" },
  titleDesc: { sortBy: "title", sortOrder: "desc" },
  sku: { sortBy: "externalId", sortOrder: "asc" },
}

export const CATALOG_SORTS = Object.keys(SORTS) as CatalogSort[]
export const CATALOG_PER_PAGE_OPTIONS = [12, 24, 48, 96]

const DEFAULT_SORT: CatalogSort = "recent"
const DEFAULT_PER_PAGE = 24
const PER_PAGE_KEY = "vekoo.products.perPage"

function isSort(value: string | null): value is CatalogSort {
  return value !== null && Object.hasOwn(SORTS, value)
}

function isStatus(value: string): value is CatalogStatus {
  return value === "active" || value === "inactive"
}

export type CatalogFilters = {
  q: string
  categories: string[]
  statuses: CatalogStatus[]
  sort: CatalogSort
  page: number
  perPage: number
}

/** Ordem da grade em linguagem de coluna, para o cabeçalho da tabela. */
export function sortAsColumn(sort: CatalogSort): { id: string; desc: boolean } {
  return { id: SORTS[sort].sortBy, desc: SORTS[sort].sortOrder === "desc" }
}

/** E o caminho de volta. A coluna ordena por si: clicar em "Atualizado" pede a data dela. */
export function sortFromColumn(id: string, desc: boolean): CatalogSort | null {
  const match = CATALOG_SORTS.find(
    (sort) => SORTS[sort].sortBy === id && (SORTS[sort].sortOrder === "desc") === desc
  )
  if (match) return match
  // Sem a combinação exata (SKU decrescente, por exemplo), fica no sentido que existe.
  return CATALOG_SORTS.find((sort) => SORTS[sort].sortBy === id) ?? null
}

/** A consulta da grade. A grade de gestão manda `includeInactive`: sem isso, item desativado some. */
export function itemsListPath(filters: CatalogFilters): string {
  const query = new URLSearchParams()
  if (filters.q) query.set("q", filters.q)
  filters.categories.forEach((path) => query.append("categories[]", path))

  // Marcar as duas situações é o mesmo que não filtrar.
  const only = filters.statuses.length === 1 ? filters.statuses[0] : null
  if (only === "inactive") query.set("active", "false")
  if (only !== "active") query.set("includeInactive", "true")

  query.set("sortBy", SORTS[filters.sort].sortBy)
  query.set("sortOrder", SORTS[filters.sort].sortOrder)
  query.set("page", String(filters.page))
  query.set("perPage", String(filters.perPage))
  return `/products/items?${query}`
}

export function useCatalogFilters() {
  const [params, setParams] = useSearchParams()
  const [storedPerPage, setStoredPerPage] = useLocalStorage<number>(PER_PAGE_KEY, DEFAULT_PER_PAGE)

  const search = params.toString()
  const filters = useMemo<CatalogFilters>(() => {
    const current = new URLSearchParams(search)
    const sort = current.get("sort")
    return {
      q: current.get("q") ?? "",
      categories: current.getAll("category"),
      statuses: current.getAll("status").filter(isStatus),
      sort: isSort(sort) ? sort : DEFAULT_SORT,
      page: Math.max(1, Number(current.get("page")) || 1),
      perPage: CATALOG_PER_PAGE_OPTIONS.includes(storedPerPage) ? storedPerPage : DEFAULT_PER_PAGE,
    }
  }, [search, storedPerPage])

  // Duas mudanças no mesmo instante (o `DataTable` troca a ordem e volta à página 1) não
  // podem partir do mesmo retrato da URL, senão a segunda desfaz a primeira. Por isso a
  // base é a última escrita, e não o `current` do roteador.
  const latest = useRef(params)
  latest.current = params

  const change = useCallback(
    (write: (query: URLSearchParams) => void, { keepPage = false } = {}) => {
      const next = new URLSearchParams(latest.current)
      if (!keepPage) next.delete("page")
      write(next)
      latest.current = next
      setParams(next, { replace: true })
    },
    [setParams]
  )

  const setQuery = useCallback(
    (q: string) =>
      change((query) => {
        if (q) query.set("q", q)
        else query.delete("q")
      }),
    [change]
  )

  const setCategories = useCallback(
    (paths: string[]) =>
      change((query) => {
        query.delete("category")
        paths.forEach((path) => query.append("category", path))
      }),
    [change]
  )

  const setStatuses = useCallback(
    (statuses: string[]) =>
      change((query) => {
        query.delete("status")
        statuses.filter(isStatus).forEach((status) => query.append("status", status))
      }),
    [change]
  )

  const setSort = useCallback(
    (sort: CatalogSort) =>
      change((query) => {
        if (sort === DEFAULT_SORT) query.delete("sort")
        else query.set("sort", sort)
      }),
    [change]
  )

  const setPage = useCallback(
    (page: number) =>
      change(
        (query) => {
          if (page > 1) query.set("page", String(page))
          else query.delete("page")
        },
        { keepPage: true }
      ),
    [change]
  )

  const setPerPage = useCallback(
    (perPage: number) => {
      setStoredPerPage(perPage)
      change(() => undefined)
    },
    [change, setStoredPerPage]
  )

  const clear = useCallback(
    () =>
      change((query) => {
        query.delete("q")
        query.delete("category")
        query.delete("status")
      }),
    [change]
  )

  const isFiltered = Boolean(filters.q || filters.categories.length || filters.statuses.length)

  return {
    filters,
    search,
    isFiltered,
    activeCount: (filters.categories.length ? 1 : 0) + (filters.statuses.length ? 1 : 0),
    setQuery,
    setCategories,
    setStatuses,
    setSort,
    setPage,
    setPerPage,
    clear,
  }
}
