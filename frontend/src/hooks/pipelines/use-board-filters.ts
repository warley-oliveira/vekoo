import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { useSearchParams } from "@/lib/router"

import {
  EMPTY_FILTERS,
  parseAdvanced,
  parseFilters,
  writeAdvanced,
  writeFilters,
  type AdvancedFilter,
  type BoardFilters,
} from "@/lib/pipelines/filters"

type UpdateOptions = {
  /** Sem entrada nova no histórico: é o caso de cada tecla da busca. */
  replace?: boolean
}

/**
 * O filtro do pipeline, inteiro na URL. `filters` e `advanced` só trocam de identidade quando o
 * conteúdo muda: abrir um card (`?card=`) também mexe na URL, e isso não pode refiltrar o quadro.
 */
export function useBoardFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const parsedFilters = parseFilters(searchParams)
  const parsedAdvanced = parseAdvanced(searchParams)

  const filtersText = JSON.stringify(parsedFilters)
  const advancedText = JSON.stringify(parsedAdvanced)

  // Por texto, de propósito: a URL é a fonte, e o objeto só serve enquanto o texto for o mesmo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parsedFilters, [filtersText])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const advanced = useMemo(() => parsedAdvanced, [advancedText])

  // Duas alterações no mesmo tique: cada uma parte do que já foi pedido.
  const latest = useRef(searchParams)
  useLayoutEffect(() => {
    latest.current = searchParams
  }, [searchParams])

  const update = useCallback(
    (write: (params: URLSearchParams) => void, { replace = false }: UpdateOptions = {}) => {
      const next = new URLSearchParams(latest.current)
      write(next)
      if (next.toString() === latest.current.toString()) return
      latest.current = next
      setSearchParams(next, { replace })
    },
    [setSearchParams]
  )

  const setFilters = useCallback(
    (patch: Partial<BoardFilters>, options?: UpdateOptions) => {
      update((params) => writeFilters(params, { ...parseFilters(params), ...patch }), options)
    },
    [update]
  )

  const setAdvanced = useCallback(
    (next: AdvancedFilter | null) => update((params) => writeAdvanced(params, next)),
    [update]
  )

  const clearAll = useCallback(() => {
    update((params) => {
      writeFilters(params, EMPTY_FILTERS)
      writeAdvanced(params, null)
    })
  }, [update])

  /** Um valor solto na URL, fora dos filtros: página e ordem da lista. */
  const setParams = useCallback(
    (values: Record<string, string | null>, options?: UpdateOptions) => {
      update((params) => {
        for (const [name, value] of Object.entries(values)) {
          if (value === null) params.delete(name)
          else params.set(name, value)
        }
      }, options)
    },
    [update]
  )

  return { filters, advanced, searchParams, setFilters, setAdvanced, clearAll, setParams }
}

export type BoardFiltersApi = ReturnType<typeof useBoardFilters>
