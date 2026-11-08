import { useCallback, useRef } from "react"
import { useSearchParams } from "@/lib/router"

/**
 * O estado de uma coleção na URL: abrir um item e voltar devolve a pessoa aonde ela estava, e dá para
 * mandar o link de um filtro. `change` parte da última escrita, e não do `params` do render: duas
 * mudanças no mesmo instante não podem partir do mesmo retrato, senão a segunda desfaz a primeira.
 * Toda mudança volta à primeira página, menos a de página.
 */
export function useUrlQuery() {
  const [params, setParams] = useSearchParams()

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

  return { search: params.toString(), change, setPage }
}
