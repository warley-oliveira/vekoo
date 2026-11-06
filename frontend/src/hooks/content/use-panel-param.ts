import { useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "react-router"

/**
 * Painel aberto no endereço (`?reply=<id>`, `?new=1`): dá para mandar o link, e recarregar não
 * perde o lugar. `param` é o nome do registro aberto; `?new=1` é o mesmo em toda tela.
 */
export function usePanelParam<Extra extends string = never>(param: string, extras?: readonly Extra[]) {
  const [searchParams, setSearchParams] = useSearchParams()

  // Salvar pode terminar com a página já fora da tela: fechar o painel, então, arrastaria a
  // pessoa de volta para cá.
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const names = useRef([param, "new", ...(extras ?? [])])

  const replaceWith = useCallback(
    (name: string | null, value?: string) => {
      if (!isMounted.current) return
      setSearchParams(
        (current) => {
          names.current.forEach((other) => current.delete(other))
          if (name && value) current.set(name, value)
          return current
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const open = useCallback((id: string) => replaceWith(param, id), [param, replaceWith])
  const openNew = useCallback(() => replaceWith("new", "1"), [replaceWith])
  const openExtra = useCallback(
    (name: Extra, id: string) => replaceWith(name, id),
    [replaceWith]
  )
  const close = useCallback(() => replaceWith(null), [replaceWith])

  return {
    selectedId: searchParams.get(param),
    creating: searchParams.get("new") === "1",
    extra: (name: Extra) => searchParams.get(name),
    open,
    openNew,
    openExtra,
    close,
  }
}
