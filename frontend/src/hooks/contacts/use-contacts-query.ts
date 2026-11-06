import { useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router"

import {
  contactsPath,
  parseListState,
  writeFilters,
  writePage,
  writePerPage,
  writeSort,
  type ContactFilters,
  type ContactListState,
} from "@/lib/contacts/filters"

type UpdateOptions = {
  /** Sem entrada nova no histórico: é o caso de cada tecla da busca. */
  replace?: boolean
}

/**
 * O estado da lista, inteiro na URL. Mudar filtro e página entra no histórico, para o voltar
 * desfazer o último passo; a busca substitui, para o voltar não refazer palavra por palavra.
 */
export function useContactsQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const state = useMemo(() => parseListState(searchParams), [searchParams])
  const path = useMemo(() => contactsPath(state), [state])

  // O DataTable pede a volta à página 1 logo depois de mudar a ordem, antes de a URL nova chegar
  // aqui. Cada alteração parte do que já foi pedido, ou a segunda apagaria a primeira.
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
    (patch: Partial<ContactFilters>, options?: UpdateOptions) => {
      update((params) => {
        writeFilters(params, { ...parseListState(params).filters, ...patch })
        writePage(params, 1)
      }, options)
    },
    [update]
  )

  const setSort = useCallback(
    (sort: ContactListState["sort"]) => {
      update((params) => {
        writeSort(params, sort)
        writePage(params, 1)
      })
    },
    [update]
  )

  const setPage = useCallback(
    (page: number, options?: UpdateOptions) => {
      update((params) => writePage(params, page), options)
    },
    [update]
  )

  const setPerPage = useCallback(
    (perPage: number) => {
      update((params) => {
        writePerPage(params, perPage)
        writePage(params, 1)
      })
    },
    [update]
  )

  /** Um valor solto na URL, fora dos filtros: qual painel está aberto. */
  const setParam = useCallback(
    (name: string, value: string | null) => {
      update(
        (params) => {
          if (value === null) params.delete(name)
          else params.set(name, value)
        },
        { replace: true }
      )
    },
    [update]
  )

  return {
    ...state,
    path,
    searchParams,
    setFilters,
    setSort,
    setPage,
    setPerPage,
    setParam,
  }
}
