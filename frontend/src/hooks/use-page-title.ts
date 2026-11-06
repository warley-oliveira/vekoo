import { useEffect } from "react"

const BRAND = "Vekoo"

/**
 * Título da aba enquanto a tela estiver montada: "Contatos · Vekoo". O título é
 * dinâmico (nome do contato, da pasta): passe `undefined` enquanto carrega.
 */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return

    const previous = document.title
    document.title = `${title} · ${BRAND}`
    return () => {
      document.title = previous
    }
  }, [title])
}
